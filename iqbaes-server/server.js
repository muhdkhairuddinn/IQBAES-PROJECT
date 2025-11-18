import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { requestLogger } from './middleware/logging.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Debug: Show current working directory and expected .env path
console.log('[DEBUG] Current working directory:', process.cwd());
console.log('[DEBUG] Server file directory:', __dirname);
console.log('[DEBUG] Expected .env path:', path.join(__dirname, '.env'));

// Load env vars from the correct path
dotenv.config({ path: path.join(__dirname, '.env') });

// Debug: Check if environment variables are loaded
console.log('[DEBUG] Environment variables after dotenv.config():');
console.log('[DEBUG] GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'LOADED' : 'NOT LOADED');
console.log('[DEBUG] MONGO_URI:', process.env.MONGO_URI ? 'LOADED' : 'NOT LOADED');
console.log('[DEBUG] JWT_SECRET:', process.env.JWT_SECRET ? 'LOADED' : 'NOT LOADED');

import connectDB from './config/db.js';
import { initIO } from './socket.js';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import userRoutes from './routes/userRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import examRoutes from './routes/examRoutes.js';
import questionBankRoutes from './routes/questionBankRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';
import logRoutes from './routes/logRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import fixQuestionsRoutes from './routes/fix-questions.js';
import replaceQuestionsRoutes from './routes/replace-questions.js';
// REMOVED: import cameraRoutes from './routes/cameraRoutes.js';

// Import monitoring routes
import monitoringRoutes from './routes/monitoringRoutes.js';

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app);

// Trust proxy to get real client IP addresses (for X-Forwarded-For headers)
// This is essential for accurate IP logging when behind a reverse proxy or load balancer
// SECURITY: Never use 'true' as it trusts all proxies and allows rate limit bypass
// For development: Trust only first proxy hop (Vite dev server)
// For production: Trust specific proxy IPs (e.g., '127.0.0.1' or '10.0.0.1')
if (process.env.NODE_ENV === 'production') {
  // In production, trust only specific proxy IPs (set in environment variable if needed)
  // Default to trusting first proxy hop for common setups (nginx, load balancer)
  app.set('trust proxy', process.env.TRUST_PROXY || 1);
} else {
  // In development, trust only first proxy hop (Vite dev server on localhost)
  app.set('trust proxy', 1); // Trust first proxy only (more secure than 'true')
}

// CORS Configuration - Apply EARLY before other middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] 
    : ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Auto-Refresh']
}));

// Enhanced Security Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://esm.sh"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  frameguard: { action: 'deny' },
  xssFilter: true,
  referrerPolicy: { policy: 'same-origin' }
}));

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Rate Limiting with OPTIONS skip - More lenient for development
// Rate Limiting designed for heavy legitimate usage (100+ students) while blocking attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Allow 2000 requests per 15 minutes per IP (enough for heavy usage)
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for CORS preflight
    if (req.method === 'OPTIONS') return true;
    // Skip for essential endpoints that need frequent access
    if (req.url.includes('/bootstrap') || req.url.includes('/heartbeat')) return true;
    return false;
  }
});

// Very lenient for logs and monitoring (auto-refresh functionality)
const logsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Very high limit for monitoring/logs
  message: {
    error: 'Too many log requests from this IP, please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS'
});


// Stricter for authentication to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 login attempts per 15 minutes (reasonable for legitimate users)
  message: {
    error: 'Too many login attempts, please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS'
});

// Very strict rate limiting for sensitive operations (admin actions, bulk operations)
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Lower limit for admin operations
  message: {
    error: 'Too many administrative requests, please try again later.',
    retryAfter: 15 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS'
});

// Moderate rate limiting for exam submissions to prevent spam
const examLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes (shorter window for exams)
  max: 20, // 20 submissions per 5 minutes (reasonable for exam taking)
  message: {
    error: 'Too many exam submissions, please try again later.',
    retryAfter: 5 * 60 // seconds
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    // Allow high-frequency monitoring fetches without being rate-limited
    const url = req.originalUrl || req.url || '';
    if (
      req.method === 'GET' && (
        url.includes('/api/submissions/active-sessions') ||
        url.includes('/api/submissions/analytics')
      )
    ) {
      return true;
    }
    return false;
  }
});

// Apply rate limiting strategically
app.use('/api/', generalLimiter); // General API protection
app.use('/api/logs', logsLimiter); // Lenient for logs/monitoring
// REMOVED: app.use('/api/camera', cameraLimiter); // Moderate for camera streaming
app.use('/api/auth/login', authLimiter); // Protect against brute force
app.use('/api/auth/register', authLimiter); // Protect registration
app.use('/api/submissions', examLimiter); // Moderate protection for exam submissions
app.use('/api/users', adminLimiter); // Stricter for user management
app.use('/api/courses', adminLimiter); // Stricter for course management

// Apply request logging (after rate limiting, before routes)
app.use(requestLogger);

// Body parsing middleware - Increase limit for camera frames
app.use(express.json({ limit: '50mb' })); // Increased for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser()); // Parse cookies for refresh token handling

// Remove the duplicate CORS configuration that was here before

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api', dataRoutes); // for bootstrap endpoint
app.use('/api/users', userRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/bank-questions', questionBankRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/fix', fixQuestionsRoutes);
app.use('/api/replace', replaceQuestionsRoutes);
// REMOVED: app.use('/api/camera', cameraRoutes); // Add camera routes

app.get('/', (req, res) => {
  res.send('IQBAES API is running...');
});

const PORT = process.env.PORT || 5000;

// Initialize Socket.IO BEFORE starting the server
const io = initIO(server);
if (io) {
  console.log('✅ Socket.IO initialized successfully');
} else {
  console.error('❌ Socket.IO initialization failed!');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://10.234.1.146:${PORT}`);
  console.log(`Socket.IO endpoint: http://localhost:${PORT}/socket.io/`);
});
