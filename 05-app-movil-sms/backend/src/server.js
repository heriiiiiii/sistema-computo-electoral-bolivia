'use strict';

require('dotenv').config();
const app = require('./app');
const { port } = require('./config/config');

app.listen(port, () => {
  console.log(`[SMS Backend] Servidor escuchando en http://localhost:${port}`);
  console.log(`[SMS Backend] Endpoint SMS: POST http://localhost:${port}/api/sms/incoming`);
  console.log(`[SMS Backend] Entorno: ${process.env.NODE_ENV || 'development'}`);
});
