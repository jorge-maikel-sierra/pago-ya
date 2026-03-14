import { Router } from 'express';
import { getRegister, postRegister } from '../controllers/auth.controller.js';

const router = Router();

// Mostrar formulario de registro
router.get('/register', getRegister);

// Procesar registro
router.post('/register', postRegister);

export default router;
