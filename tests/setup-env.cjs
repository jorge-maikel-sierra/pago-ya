// Carga .env.test antes de cada suite de tests para aislar el entorno
// de pruebas del entorno de desarrollo (.env).
// dotenv no sobreescribe variables ya definidas en el proceso (process.env).
// Se usa require() (CJS) porque Jest carga setupFiles antes de inicializar
// el soporte ESM experimental del runner y este archivo debe ser parseado.
const { config } = require('dotenv');
const { resolve } = require('node:path');

config({ path: resolve(__dirname, '..', '.env.test'), override: false });
