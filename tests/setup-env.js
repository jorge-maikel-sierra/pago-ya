// Carga .env.test antes de cada suite de tests para aislar el entorno
// de pruebas del entorno de desarrollo (.env).
// dotenv no sobreescribe variables ya definidas en el proceso (process.env).
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env.test'), override: false });
