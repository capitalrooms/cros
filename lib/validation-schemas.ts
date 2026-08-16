import { z } from 'zod'

/**
 * Validation schemas for all user inputs
 * Used to prevent injection attacks, SQL injection, XSS, etc.
 */

// ============================================================================
// ACKNOWLEDGMENT NOTES
// ============================================================================

export const AcknowledgmentNoteSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title must be less than 255 characters')
    .regex(/^[a-zA-Z0-9\s\-.,!?'"()&]+$/, 'Title contains invalid characters'),

  content: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(5000, 'Message must be less than 5000 characters'),

  internalNote: z
    .string()
    .max(2000, 'Internal note must be less than 2000 characters')
    .optional()
    .default(''),

  tenancyId: z.string().uuid('Invalid tenancy ID'),
  roomId: z.string().uuid('Invalid room ID').optional(),
})

// ============================================================================
// PROPERTY NOTES
// ============================================================================

export const PropertyNoteSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(255, 'Title must be less than 255 characters'),

  content: z
    .string()
    .min(5, 'Content must be at least 5 characters')
    .max(3000, 'Content must be less than 3000 characters'),

  propertyId: z.string().uuid('Invalid property ID'),
  roomId: z.string().uuid('Invalid room ID').optional(),
})

// ============================================================================
// MAINTENANCE TICKETS
// ============================================================================

export const MaintenanceTicketSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be less than 200 characters'),

  description: z
    .string()
    .max(3000, 'Description must be less than 3000 characters')
    .optional()
    .default(''),

  category: z
    .enum(['heating', 'plumbing', 'electrical', 'locks', 'structure', 'general'])
    .default('general'),

  priority: z
    .enum(['low', 'medium', 'high', 'emergency'])
    .default('medium'),

  roomId: z.string().uuid('Invalid room ID').optional(),
  propertyId: z.string().uuid('Invalid property ID'),
})

// ============================================================================
// VIEWING DETAILS
// ============================================================================

export const ViewingSchema = z.object({
  visitorName: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters')
    .regex(/^[a-zA-Z\s\-'.]+$/, 'Name contains invalid characters'),

  visitorEmail: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters')
    .optional(),

  visitorPhone: z
    .string()
    .regex(/^[0-9+\-\s()]+$/, 'Phone number contains invalid characters')
    .max(20, 'Phone number must be less than 20 characters')
    .optional(),

  viewingDate: z
    .string()
    .refine((date) => {
      const d = new Date(date)
      return d >= new Date()
    }, 'Viewing date must be in the future'),

  viewingSlot: z
    .string()
    .max(10, 'Invalid time slot'),

  roomId: z.string().uuid('Invalid room ID'),
  propertyId: z.string().uuid('Invalid property ID'),
})

// ============================================================================
// CONTRACTOR NOTES
// ============================================================================

export const ContractorNotesSchema = z.object({
  notes: z
    .string()
    .max(5000, 'Notes must be less than 5000 characters')
    .optional()
    .default(''),

  ticketId: z.string().uuid('Invalid ticket ID'),
})

// ============================================================================
// CLEANER TASK TEMPLATES
// ============================================================================

export const TaskTemplateSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must be less than 200 characters'),

  description: z
    .string()
    .max(1000, 'Description must be less than 1000 characters')
    .optional()
    .default(''),

  propertyId: z.string().uuid('Invalid property ID'),
})

// ============================================================================
// SAFETY CHECK ISSUE REPORT
// ============================================================================

export const SafetyCheckIssueSchema = z.object({
  issueType: z
    .string()
    .min(1, 'Please select an issue type')
    .max(255, 'Issue type is invalid'),

  issueDescription: z
    .string()
    .min(5, 'Description must be at least 5 characters')
    .max(2000, 'Description must be less than 2000 characters'),

  checkId: z.string().uuid('Invalid check ID'),
})

// ============================================================================
// SMS PHONE NUMBER
// ============================================================================

export const PhoneNumberSchema = z.object({
  phone: z
    .string()
    .regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number format')
    .min(10, 'Phone number must be at least 10 digits')
    .max(20, 'Phone number must be less than 20 characters'),
})

// ============================================================================
// COMPLIANCE LOG
// ============================================================================

export const ComplianceLogSchema = z.object({
  checkType: z
    .enum(['fire_door', 'smoke_alarm'], {
      errorMap: () => ({ message: 'Invalid check type' }),
    }),

  checkedDate: z
    .string()
    .refine((date) => {
      const d = new Date(date)
      return d <= new Date()
    }, 'Date cannot be in the future'),

  notes: z
    .string()
    .max(1000, 'Notes must be less than 1000 characters')
    .optional()
    .default(''),

  propertyId: z.string().uuid('Invalid property ID'),
})

// ============================================================================
// HELPER FUNCTION - Sanitize output for display
// ============================================================================

export function sanitizeForDisplay(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

// ============================================================================
// VALIDATION UTILITY
// ============================================================================

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): { valid: boolean; data?: T; errors?: Record<string, string> } {
  try {
    const validated = schema.parse(data)
    return { valid: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {}
      error.errors.forEach((err) => {
        const path = err.path.join('.')
        errors[path] = err.message
      })
      return { valid: false, errors }
    }
    return { valid: false, errors: { _general: 'Validation failed' } }
  }
}
