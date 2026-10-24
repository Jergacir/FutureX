const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'transactions.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET debe configurarse en producción.');
}

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET no configurado; las sesiones terminarán al reiniciar el servidor.');
}

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  for (const file of [DATA_FILE, USERS_FILE]) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify([], null, 2), 'utf8');
    }
  }
}

function readJsonArray(file) {
  ensureDataFiles();
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`El archivo ${path.basename(file)} debe contener una lista.`);
  }
  return parsed;
}

function writeJsonArray(file, entries) {
  ensureDataFiles();
  const temporaryFile = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(entries, null, 2), 'utf8');
  fs.renameSync(temporaryFile, file);
}

function readTransactions() {
  return readJsonArray(DATA_FILE);
}

function readUsers() {
  return readJsonArray(USERS_FILE);
}

function writeTransactions(transactions) {
  writeJsonArray(DATA_FILE, transactions);
}

function writeUsers(users) {
  writeJsonArray(USERS_FILE, users);
}

function createSessionToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

function setSessionCookie(res, user) {
  res.cookie('session', createSessionToken(user), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = readUsers().find((entry) => entry.id === payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'La sesión ya no es válida. Inicia sesión de nuevo.' });
    }
    req.user = { id: user.id, email: user.email };
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'La sesión expiró. Inicia sesión de nuevo.' });
    }
    next(error);
  }
}

function normalizeTipo(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (['ingreso', 'venta', 'cobro', 'ingr', 'ingresos'].some((item) => value.includes(item))) {
    return 'ingreso';
  }
  if (['gasto', 'compra', 'pago', 'egreso', 'gastos'].some((item) => value.includes(item))) {
    return 'gasto';
  }
  return null;
}

function parseJsonFromText(rawText) {
  const cleaned = String(rawText || '').replace(/```json|```/gi, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('No se pudo parsear la respuesta JSON');
  }
}

async function extractWithGemini({ text, imageBase64, mimeType }) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Configura GEMINI_API_KEY para analizar voz o imágenes.');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.8-flash' });

    const prompt = `Eres un asistente financiero para negocios pequeños. Extracta una sola transacción de texto o una imagen de boleta. Devuelve solo JSON con este esquema: {"tipo":"ingreso"|"gasto","monto":123.45,"descripcion":"texto breve"}. No agregues explicaciones.`;

    const parts = [{ text: `${prompt}\n\nTexto proporcionado:\n${text || ''}` }];

    if (imageBase64 && mimeType) {
      parts.push({
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
    });

    const responseText = await result.response.text();
    const parsed = parseJsonFromText(responseText);

    if (!parsed || (!parsed.monto && parsed.monto !== 0)) {
      throw new Error('La respuesta de Gemini no contiene datos válidos');
    }

    return {
      tipo: normalizeTipo(parsed.tipo),
      monto: Number(parsed.monto),
      descripcion: String(parsed.descripcion || 'Transacción').slice(0, 60),
    };
  } catch (error) {
    console.error('Gemini error:', error.message);
    throw new Error('No se pudo analizar la entrada con Gemini.');
  }
}

function calculateMetrics(transactions) {
  const totalIngresos = transactions
    .filter((item) => item.tipo === 'ingreso')
    .reduce((sum, item) => sum + Number(item.monto || 0), 0);

  const totalGastos = transactions
    .filter((item) => item.tipo === 'gasto')
    .reduce((sum, item) => sum + Number(item.monto || 0), 0);

  const saldo = totalIngresos - totalGastos;

  return {
    totalIngresos,
    totalGastos,
    saldo,
    totalTransacciones: transactions.length,
  };
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}));
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' },
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'online', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', authRateLimit, async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Escribe un correo electrónico válido.' });
    }
    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'La contraseña debe tener entre 10 y 128 caracteres.' });
    }

    const users = readUsers();
    if (users.some((user) => user.email === email)) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
    }

    const user = {
      id: crypto.randomUUID(),
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    writeUsers(users);
    setSessionCookie(res, user);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', authRateLimit, async (req, res, next) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = readUsers().find((entry) => entry.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    setSessionCookie(res, user);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.use('/api/transactions', requireAuth);
app.use('/api/reports', requireAuth);

app.get('/api/transactions', (req, res) => {
  const transactions = readTransactions().filter((item) => item.userId === req.user.id).sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  res.json(transactions);
});

app.get('/api/reports', (req, res) => {
  const transactions = readTransactions().filter((item) => item.userId === req.user.id);
  const metrics = calculateMetrics(transactions);

  res.json({
    ...metrics,
    recent: transactions.slice(0, 5),
    ingresosPorMes: transactions
      .filter((t) => t.tipo === 'ingreso')
      .reduce((acc, item) => {
        const date = new Date(item.createdAt || Date.now());
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        acc[key] = (acc[key] || 0) + Number(item.monto || 0);
        return acc;
      }, {}),
    gastosPorMes: transactions
      .filter((t) => t.tipo === 'gasto')
      .reduce((acc, item) => {
        const date = new Date(item.createdAt || Date.now());
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        acc[key] = (acc[key] || 0) + Number(item.monto || 0);
        return acc;
      }, {}),
  });
});

app.post('/api/transactions/extract', upload.single('image'), async (req, res) => {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text : '';

    if (!text && !req.file) {
      return res.status(400).json({ error: 'Falta texto oral o una imagen para analizar.' });
    }

    const imageBase64 = req.file ? req.file.buffer.toString('base64') : null;
    const mimeType = req.file ? req.file.mimetype : null;

    const extracted = await extractWithGemini({ text, imageBase64, mimeType });
    const normalized = {
      tipo: normalizeTipo(extracted.tipo),
      monto: Number(extracted.monto || 0),
      descripcion: String(extracted.descripcion || 'Transacción').slice(0, 60),
      source: req.file ? 'image' : 'voice',
    };

    if (!normalized.tipo || !Number.isFinite(normalized.monto) || normalized.monto <= 0) {
      return res.status(422).json({ error: 'No pude interpretar bien la transacción. Inténtalo otra vez.' });
    }

    res.json(normalized);
  } catch (error) {
    console.error('extract error:', error);
    res.status(500).json({ error: 'Error interno al procesar la transacción.' });
  }
});

app.post('/api/transactions', (req, res) => {
  try {
    const payload = req.body || {};
    const tipo = normalizeTipo(payload.tipo);
    const monto = Number(payload.monto || 0);
    const descripcion = String(payload.descripcion || 'Transacción').slice(0, 60);

    if (!tipo || !Number.isFinite(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Tipo de transacción o monto inválidos.' });
    }

    const transactions = readTransactions();
    const record = {
      id: `txn_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      userId: req.user.id,
      tipo,
      monto,
      descripcion,
      source: payload.source || 'manual',
      createdAt: new Date().toISOString(),
    };

    transactions.unshift(record);
    writeTransactions(transactions);
    res.status(201).json(record);
  } catch (error) {
    console.error('save transaction error:', error);
    res.status(500).json({ error: 'Error al guardar la transacción.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Unhandled server error:', error);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
