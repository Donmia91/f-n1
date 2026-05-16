import { getDb } from '../db/init';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLogEntry {
  id: string;
  user_id: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: string;
  ip_address?: string;
  user_agent?: string;
  result: 'success' | 'failure';
  error_message?: string;
  created_at: string;
}

export async function logAudit(
  userId: string,
  action: string,
  options: {
    resourceType?: string;
    resourceId?: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    result?: 'success' | 'failure';
    errorMessage?: string;
  } = {}
): Promise<AuditLogEntry> {
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent, result, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      action,
      options.resourceType || null,
      options.resourceId || null,
      options.details ? JSON.stringify(options.details) : null,
      options.ipAddress || null,
      options.userAgent || null,
      options.result || 'success',
      options.errorMessage || null,
      now
    ]
  );

  return {
    id,
    user_id: userId,
    action,
    resource_type: options.resourceType,
    resource_id: options.resourceId,
    details: options.details ? JSON.stringify(options.details) : undefined,
    ip_address: options.ipAddress,
    user_agent: options.userAgent,
    result: options.result || 'success',
    error_message: options.errorMessage,
    created_at: now
  };
}

export async function getAuditLog(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<AuditLogEntry[]> {
  const db = getDb();
  return db.all(
    `SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}
