import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { initDb, closeDb } from './db/init';
import { userSessionMiddleware, errorHandler, securityHeaders } from './middleware/auth';
import socialRoutes from './routes/social';
import actionsRoutes from './routes/actions';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8787;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173', 'file://'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-ID']
  })
);
app.use(securityHeaders);
app.use(userSessionMiddleware);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/social', socialRoutes);
app.use('/api/social', actionsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// Error handler
app.use(errorHandler);

// Initialize and start server
async function start() {
  try {
    // Initialize database
    const dbPath = process.env.DB_PATH || './data/fn1.db';
    await initDb(dbPath);
    console.log(`✓ Database initialized at ${dbPath}`);

    // Validate encryption key
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
      console.error('ERROR: ENCRYPTION_KEY must be a 64-character hex string');
      console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
      process.exit(1);
    }

    // Validate X OAuth credentials
    if (!process.env.X_API_KEY || !process.env.X_API_SECRET) {
      console.warn('⚠ X OAuth credentials not configured (X_API_KEY, X_API_SECRET)');
      console.warn('  Social OAuth will fail until credentials are set in .env');
    }

    // Start server
    app.listen(PORT, () => {
      console.log(`✓ Team Workstation Social Backend running on port ${PORT}`);
      console.log(`✓ Frontend CORS origin: ${FRONTEND_URL}`);
      console.log(`✓ API endpoints:`);
      console.log(`  - POST   /api/social/oauth/x/start`);
      console.log(`  - POST   /api/social/oauth/x/callback`);
      console.log(`  - GET    /api/social/accounts`);
      console.log(`  - DELETE /api/social/accounts/:accountId`);
      console.log(`  - GET    /api/social/market-signals`);
      console.log(`  - POST   /api/social/market-signals/update`);
      console.log(`  - GET    /api/social/actions`);
      console.log(`  - POST   /api/social/actions`);
      console.log(`  - GET    /api/social/actions/:actionId`);
      console.log(`  - POST   /api/social/actions/:actionId/approve`);
      console.log(`  - POST   /api/social/actions/:actionId/reject`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('SIGTERM received, shutting down gracefully...');
      await closeDb();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('SIGINT received, shutting down gracefully...');
      await closeDb();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
