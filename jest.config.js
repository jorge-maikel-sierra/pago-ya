/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  transform: {},
  moduleFileExtensions: ['js', 'mjs', 'cjs'],
  testMatch: ['**/tests/**/*.test.js'],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: ['/node_modules/', '/prisma/'],
  coverageThreshold: {
    global: {
      statements: 65,
      branches: 50,
      functions: 55,
      lines: 65,
    },
  },
  // .cjs porque el paquete usa "type":"module" y Jest carga setupFiles antes
  // de inicializar el soporte ESM — require() solo funciona en archivos CJS.
  setupFiles: ['<rootDir>/tests/setup-env.cjs'],
};
