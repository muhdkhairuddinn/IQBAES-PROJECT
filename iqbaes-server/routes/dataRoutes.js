import express from 'express';
import { getBootstrapData } from '../controllers/dataController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/bootstrap', protect, getBootstrapData);

export default router;
