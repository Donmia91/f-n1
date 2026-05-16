import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/init';
import { v4 as uuidv4 } from 'uuid';

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
}

/**
 * Middleware to extract or create user session from header
 */
export async function userSessionMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Check for Authorization header or session cookie
    const authHeader = req.headers.authorization;
    let userId: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      userId = authHeader.substring(7);
    } else if (req.query.userId) {
      userId = req.query.userId as string;
    } else if (req.body?.userId) {
      userId = req.body.userId;
    } else if (req.cookies?.userId) {
      userId = req.cookies.userId;
    }

    // Create or get user
    if (!userId) {
      userId = uuidv4();
    }

    const db = getDb();
    const existingUser = await db.get(`SELECT id FROM users WHERE id = ?`, [userId]);

    if (!existingUser) {
      await db.run(
        `INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)`,
        [userId, `user_${userId.substring(0, 8)}@team-workstation.local`, new Date().toISOString(), new Date().toISOString()]
      );
    }

    req.userId = userId;
    res.setHeader('X-User-ID', userId);
    next();
  } catch (error) {
    console.error('User session middleware error:', error);
    res.status(500).json({ error: 'Session initialization failed' });
  }
}

/**
 * Error handler middleware
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  if (err.message?.includes('ENCRYPTION_KEY')) {
    return res.status(500).json({
      error: 'Server configuration error: encryption key not set',
      code: 'CONFIG_ERROR'
    });
  }

  if (err.message?.includes('OAuth')) {
    return res.status(401).json({
      error: err.message,
      code: 'OAUTH_ERROR'
    });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR'
  });
}

/**
 * CORS and header setup middleware
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('X-XSS-Protection', '1; mode=block');
  next();
}
