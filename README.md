# FutureX • Asistente Financiero & Pasaporte Crediticio con IA

> **Desafío Oficial Hackathon futurX (Fase 2):**  
> *"Asistente de IA por voz e imagen que digitaliza ingresos y gastos de pequeños negocios informales para ordenar sus finanzas y facilitar su acceso al crédito."*

---

## 🚀 La Propuesta Ganadora de Innovación

La mayoría de micronegocios y trabajadores informales en Latinoamérica (bodegas, puestos de mercado, comida al paso, talleres, taxistas) fracasan o caen en préstamos usureros y extorsivos (**"Gota a Gota"**, con tasas del 20% mensual o diario) porque **carecen de historial contable formal**. Para los bancos son "invisibles", a pesar de tener ventas diarias y flujo de caja real.

**FutureX** resuelve los dos cuellos de botella del desafío:
1. **Digitalización Zero-UI (Cero fricción):** Captura ingresos y gastos por **voz natural coloquial** y mediante **visión artificial de capturas de billeteras digitales (Yape, Plin, Nequi)** y boletas físicas con IA (Gemini).
2. **Inclusión Financiera Real:** Transforma ese flujo de datos desordenado en un **Score Crediticio Alternativo (0 - 950)** y un **"Pasaporte Financiero Oficial"** con verificación criptográfica SHA-256, listo para ser presentado ante Cajas Municipales, Mibanco y Fintechs para obtener microcréditos a tasas justas.

---

## 🌟 Pilares Innovadores Implementados

| Pilar | Innovación Técnica | Impacto Social |
|---|---|---|
| **Digitalización Multimodal** | Modelo de Gemini entrenado para reconocer audios coloquiales y comprobantes digitales (Yape, Plin, transferencias) + OCR de boletas de mercado. | El comerciante no tiene que aprender software contable; solo dicta un audio de 3 segundos o sube un pantallazo de Yape. |
| **Credit Scoring Alternativo** | Algoritmo que evalúa solvencia en base a consistencia de cobros, margen neto, frecuencia transaccional y liquidez libre. | Democratiza la calificación crediticia sin exigir RUC formal ni balances firmados por contador. |
| **Simulador Anti-Usura** | Herramienta interactiva que calcula cuotas formales y compara el ahorro directo frente al crédito informal extorsivo. | Demuestra visualmente cómo el negocio se ahorra miles de soles en intereses destructivos. |
| **Pasaporte Crediticio Oficial** | Generador de certificados formales de solvencia con ID único y hash criptográfico SHA-256 para validación bancaria. | El documento físico/PDF que el microempresario lleva a la Caja Municipal para acceder a su primer capital de trabajo formal. |
| **Copiloto Financiero IA** | Diagnóstico proactivo que alerta sobre gastos hormiga y brinda estrategias personalizadas para optimizar compras al por mayor. | Actúa como un asesor financiero personal gratuito en el bolsillo del comerciante. |

---

## 🛠️ Cómo Iniciar Localmente

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Configuración de entorno (`.env`):**
   - El archivo `.env` ya cuenta con un `JWT_SECRET` seguro por defecto.
   - (Opcional): Agrega tu `GEMINI_API_KEY` para activar la extracción directa con la API de Google Gemini.  
   - *Nota:* Si no cuentas con API key en el momento de la evaluación, el sistema cuenta con un **motor heurístico NLP integrado** que procesará la voz y el texto sin interrupciones.

3. **Iniciar el servidor:**
   ```bash
   npm start
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

4. **⚡ Botón de Demostración Rápida:**
   - Una vez registrado o iniciada la sesión, haz clic en el botón superior **"Datos Demo"**.
   - Inyectará automáticamente 9 transacciones representativas de una microbodega (ventas por Yape, compras en el mercado mayorista, recibos de servicios) para visualizar inmediatamente el cálculo del Score Crediticio, el simulador y el Pasaporte.

---

## 📋 Estructura Recomendada para el Pitch (Componente 2 - 3 a 5 Slides)

Según las Bases de la Hackathon futurX, el entregable debe ser una presentación de **3 a 5 diapositivas** concisas, sin nombres personales, universidades ni países (regla de anonimato):

- **Slide 1 • El Problema Social:** La trampa de la invisibilidad financiera y la extorsión del crédito "Gota a Gota" en micronegocios informales.
- **Slide 2 • La Solución FutureX:** Digitalización multimodal Zero-UI (voz + capturas de Yape/boletas) y ordenamiento del flujo de caja.
- **Slide 3 • El Pasaporte Crediticio & Score Alternativo:** Cómo la IA convierte transacciones cotidianas en un certificado auditable para Cajas Municipales y Fintechs.
- **Slide 4 • Arquitectura Técnica & IA:** Uso de modelos multimodales (Gemini), motor de credit scoring e interfaz intuitiva.
- **Slide 5 • Impacto y Escalabilidad:** Ahorro financiero familiar, inclusión bancaria masiva y erradicación del crédito informal.
