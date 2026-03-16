import { PrismaClient } from '@prisma/client';
import env from './env.js';

const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['error'],
});

export default prisma;
