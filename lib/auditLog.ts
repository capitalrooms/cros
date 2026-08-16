/**
 * Audit Logging Utility
 * Log all user actions for security monitoring and compliance
 *
 * Usage in API routes:
 * await logAudit({
 *   userId: user.id,
 *   action: 'create',
 *   table: 'maintenance_tickets',
 *   recordId: ticket.id,
 *   details: `Created ticket: ${ticket.title}`,
 *   ipAddress: req.headers.get('x-forwarded-for'),
 * })
 */

import { createClient } from '@/lib/supabase'

export interface AuditLogEvent {
  userId: string
  action: 'create' | 'read' | 'update' | 'delete' | 'login' | 'logout' | string
  table?: string  // Table name affected (e.g., 'maintenance_tickets')
  recordId?: string  // ID of record affected
  details?: string  // JSON or text details of action
  ipAddress?: string  // Client IP address
  userAgent?: string  // Browser/client info
}

/**
 * Log an audit event
 * Called server-side after sensitive operations
 *
 * @param event Audit event to log
 * @returns true if logged successfully
 */
export async function logAudit(event: AuditLogEvent): Promise<boolean> {
  try {
    const supabase = createClient()

    const { error } = await supabase
      .from('audit_logs')
      .insert({
        user_id: event.userId,
        action: event.action,
        table_name: event.table || null,
        record_id: event.recordId || null,
        details: event.details || null,
        ip_address: event.ipAddress || null,
        user_agent: event.userAgent || null,
      })

    if (error) {
      console.error('Failed to log audit event:', error)
      // Don't throw - audit failure shouldn't break the main operation
      return false
    }

    return true
  } catch (err) {
    console.error('Audit log error:', err)
    return false
  }
}

/**
 * Log a login attempt
 * @param userId User ID
 * @param success Whether login succeeded
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logLoginAttempt(
  userId: string,
  success: boolean,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: success ? 'login' : 'login_failed',
    details: success ? 'Successful login' : 'Failed login attempt',
    ipAddress,
  })
}

/**
 * Log a logout
 * @param userId User ID
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logLogout(userId: string, ipAddress?: string): Promise<boolean> {
  return logAudit({
    userId,
    action: 'logout',
    details: 'User logged out',
    ipAddress,
  })
}

/**
 * Log a data access
 * @param userId User ID
 * @param table Table accessed
 * @param recordId Record ID (optional)
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logDataAccess(
  userId: string,
  table: string,
  recordId?: string,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: 'read',
    table,
    recordId,
    details: `Accessed ${table}${recordId ? ` record ${recordId}` : ''}`,
    ipAddress,
  })
}

/**
 * Log a data creation
 * @param userId User ID
 * @param table Table affected
 * @param recordId New record ID
 * @param details Details of what was created
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logDataCreate(
  userId: string,
  table: string,
  recordId: string,
  details?: string,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: 'create',
    table,
    recordId,
    details: details || `Created record in ${table}`,
    ipAddress,
  })
}

/**
 * Log a data update
 * @param userId User ID
 * @param table Table affected
 * @param recordId Record ID updated
 * @param changes What changed (e.g., "status: 'open' -> 'closed'")
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logDataUpdate(
  userId: string,
  table: string,
  recordId: string,
  changes?: string,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: 'update',
    table,
    recordId,
    details: changes || `Updated record in ${table}`,
    ipAddress,
  })
}

/**
 * Log a data deletion
 * @param userId User ID
 * @param table Table affected
 * @param recordId Record ID deleted
 * @param details Details of what was deleted
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logDataDelete(
  userId: string,
  table: string,
  recordId: string,
  details?: string,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: 'delete',
    table,
    recordId,
    details: details || `Deleted record from ${table}`,
    ipAddress,
  })
}

/**
 * Log a sensitive operation (e.g., viewing contractor details, accessing tenant PII)
 * @param userId User ID
 * @param operation What operation (e.g., "view_contractor_details")
 * @param resourceId ID of resource accessed
 * @param details Details of operation
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logSensitiveOperation(
  userId: string,
  operation: string,
  resourceId: string,
  details?: string,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: operation,
    recordId: resourceId,
    details: details || `Sensitive operation: ${operation}`,
    ipAddress,
  })
}

/**
 * Log a potential security issue
 * @param userId User ID (or 'system' if origin unknown)
 * @param issue What security issue (e.g., "failed_auth", "permission_denied", "invalid_input")
 * @param details Details of issue
 * @param ipAddress Client IP
 * @returns true if logged
 */
export async function logSecurityEvent(
  userId: string,
  issue: string,
  details?: string,
  ipAddress?: string
): Promise<boolean> {
  return logAudit({
    userId,
    action: `security_${issue}`,
    details: details || `Security event: ${issue}`,
    ipAddress,
  })
}

/**
 * Extract client IP from request headers
 * Handles proxies, load balancers
 * @param headers Request headers
 * @returns IP address string
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  return 'unknown'
}

/**
 * Extract user agent from request headers
 * @param headers Request headers
 * @returns User agent string
 */
export function getUserAgent(headers: Headers): string {
  return headers.get('user-agent') || 'unknown'
}
