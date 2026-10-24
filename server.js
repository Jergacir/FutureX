const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'transactions.json');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

function readTransactions() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('No pude leer transacciones:', error.message);
    return [];
  }
}

function writeTransactions(transactions) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(transactions, null, 2), 'utf8');
}

function normalizeMonto(value) {
  if (typeof value === 'number') return Number(value);
  if (typeof value === 'string') {
    const cleaned = value
      .replace(/[$\s,]/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.');
    return Number(cleaned);
  }
  return 0;
}

function normalizeTipo(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (['ingreso', 'venta', 'cobro', 'ingr', 'ingresos'].some((item) => value.includes(item))) {
    return 'ingreso';
  }
  return 'gasto';
}

function fallbackExtraction(text = '') {
  const source = String(text || '').trim();
  const lower = source.toLowerCase();
  const tipo = normalizeTipo(lower.includes('venta') || lower.includes('ingreso') || lower.includes('cobro') ? 'ingreso' : 'gasto');
  const matches = source.match(/\d+(?:[.,]\d{1,2})?/g) || [];
  const monto = matches.length ? normalizeMonto(matches[0]) : 0;
  const description = source
    .replace(/(ingreso|gasto|venta|compra|boleta|recibo|de|por|del|la|y|el|un)/gi, ' ')
    .replace(/[^a-zA-Z0-9 áéíóúñüÁÉÍÓÚÑÜ]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(' ') || 'Transacción';

  return {
    tipo,
    monto,
    descripcion: description.charAt(0).toUpperCase() + description.slice(1),
  };
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
    return fallbackExtraction(text || 'Venta de 150 pesos');
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
    return fallbackExtraction(text || 'Venta de 150 pesos');
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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'online', timestamp: new Date().toISOString() });
});

app.get('/api/transactions', (req, res) => {
  const transactions = readTransactions().sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  res.json(transactions);
});

app.get('/api/reports', (req, res) => {
  const transactions = readTransactions();
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

    if (!normalized.tipo || !normalized.monto || normalized.monto <= 0) {
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

    if (!['ingreso', 'gasto'].includes(tipo) || !monto || monto <= 0) {
      return res.status(400).json({ error: 'Tipo de transacción o monto inválidos.' });
    }

    const transactions = readTransactions();
    const record = {
      id: `txn_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
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

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
