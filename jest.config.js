/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs'],
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/prisma/'],
  // Carga .env.test antes de ejecutar los tests para aislar el entorno de pruebas
  setupFiles: ['<rootDir>/tests/setup-env.js'],
};
