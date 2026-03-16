import { Router } from 'express';
import { z } from 'zod';
import validate from '../middleware/validate.js';
import { registerSchema } from '../schemas/auth.schema.js';
import { getRegister, postRegister } from '../controllers/auth.controller.js';

const router = Router();

// Mostrar formulario de registro
router.get('/register', getRegister);

// Procesar registro — validate captura ZodErrors y los propaga al errorHandler global
router.post('/register', validate(z.object({ body: registerSchema })), postRegister);

export default router;
