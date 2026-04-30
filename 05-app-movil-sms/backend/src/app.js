'use strict';

const express = require('express');
const morgan = require('morgan');
const smsRoutes = require('./routes/smsRoutes');

const app = express();

// ── Middlewares globales ───────────────────────────────────────────────────────

// HTTP request logger (formato compacto en producción, dev en desarrollo)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Los gateways SMS envían el body como JSON o como application/x-www-form-urlencoded.
// Se habilitan ambos parsers para soportar Twilio, Africa's Talking y genéricos.
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Rutas ─────────────────────────────────────────────────────────────────────

// Todas las rutas SMS bajo /api/sms
app.use('/api/sms', smsRoutes);

// Health check (útil para monitoreo y despliegue)
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Cualquier ruta no reconocida devuelve 404 (nunca 500 por ruta inexistente)
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

// Manejador de errores global: captura cualquier error no controlado en rutas
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error global]', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
