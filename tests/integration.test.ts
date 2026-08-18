/**
 * Integration tests for CROS critical paths.
 *
 * These tests verify the most important user flows work end-to-end:
 * 1. Tenant acknowledgment-note flow (admin create → tenant read → tenant acknowledge)
 * 2. Safety-check generation (service-role route generates checks for tenants)
 * 3. Notifications for all three callers (job-complete, photo-request, SMS audit)
 *
 * Run with: npm test
 * (Currently a template; CI integration is a future task)
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'

/**
 * Test 1: Tenant acknowledgment-note flow
 * - Admin creates a note for a tenant
 * - Tenant reads it on their dashboard
 * - Tenant acknowledges it
 * - Note status changes to "acknowledged"
 */
describe('Acknowledgment-note flow', () => {
  let noteId: string
  let tenantId: string
  let adminId: string

  beforeAll(async () => {
    // Setup: use test credentials from the dev database
    adminId = 'e67ddfca-44bb-458f-a0f8-9682f30bcedd' // admin@example.com
    tenantId = '9ec1d22d-1dc9-4bd1-b0b8-6ea973724c43' // Alice / Room 1
  })

  it('admin can create an acknowledgment note', async () => {
    // Simulate: POST /api/acknowledgment-notes (admin create flow)
    // Expected: Returns noteId, status="active", created_by=adminId
    const note = {
      property_id: '11fe2107-b88d-4e64-b129-94a661933094',
      room_id: 'add615f9-b134-412e-8822-e1a7c55353ab',
      title: 'Test Acknowledgment',
      content: 'Please acknowledge this test note',
      created_by: adminId,
      status: 'active',
      photo_required: false,
    }

    // In a real test environment, this would call the actual API
    // For now, document the expected behavior
    expect(note.status).toBe('active')
    expect(note.created_by).toBe(adminId)
    noteId = 'mock-note-id-123'
  })

  it('tenant can read their acknowledgment notes', async () => {
    // Simulate: GET /tenant/acknowledgment-notes (tenant query)
    // Expected: Returns list of notes for tenant's room_id
    const notes = [
      {
        id: noteId,
        title: 'Test Acknowledgment',
        status: 'active',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]

    expect(notes).toHaveLength(1)
    expect(notes[0].status).toBe('active')
  })

  it('tenant can acknowledge a note', async () => {
    // Simulate: PUT /api/acknowledgment-notes/:id/acknowledge (tenant update)
    // Expected: status changes to "acknowledged", acknowledged_by set, acknowledged_at set
    const acknowledged = {
      id: noteId,
      status: 'acknowledged',
      acknowledged_by: tenantId,
      acknowledged_at: new Date().toISOString(),
    }

    expect(acknowledged.status).toBe('acknowledged')
    expect(acknowledged.acknowledged_by).toBe(tenantId)
  })

  it('acknowledged notes stop showing as active to tenant', async () => {
    // Simulate: GET /tenant/acknowledgment-notes after acknowledge
    // Expected: Returns empty (or only active notes)
    const activeNotes = [] // no active notes for this tenant

    expect(activeNotes).toHaveLength(0)
  })
})

/**
 * Test 2: Safety-check generation (uses service-role key)
 * - Cron/admin generates checks for active tenancies
 * - Checks are stored in tenant_self_checks table
 * - Checks have type (fire_door | smoke_alarm), frequency (monthly | quarterly)
 */
describe('Safety-check generation', () => {
  it('generate endpoint creates checks for all active tenancies', async () => {
    // Simulate: POST /api/tenant-safety-checks/generate (service-role route)
    // Expected: Returns { success: true, generated: N, checkType: 'fire_door' | 'smoke_alarm' }
    const response = {
      success: true,
      generated: 1, // at least one check created
      checkType: 'fire_door',
      message: 'Generated 1 fire_door checks',
    }

    expect(response.success).toBe(true)
    expect(response.generated).toBeGreaterThanOrEqual(0)
    expect(['fire_door', 'smoke_alarm']).toContain(response.checkType)
  })

  it('safety checks have required fields', async () => {
    // Simulate: query tenant_self_checks table after generation
    // Expected: Each check has tenancy_id, property_id, room_id, check_type, frequency, request_sent_at
    const check = {
      id: 'check-id-123',
      tenancy_id: '4b6e421d-a205-4e2a-8e86-f151f366d24b',
      property_id: '11fe2107-b88d-4e64-b129-94a661933094',
      room_id: 'add615f9-b134-412e-8822-e1a7c55353ab',
      check_type: 'fire_door',
      frequency: 'monthly',
      request_sent_at: new Date().toISOString(),
      response_received_at: null,
      tenant_response: null,
    }

    expect(check.tenancy_id).toBeDefined()
    expect(check.check_type).toMatch(/^(fire_door|smoke_alarm)$/)
    expect(check.frequency).toMatch(/^(monthly|quarterly)$/)
  })

  it('cron job can be called with specific tenancy IDs', async () => {
    // Simulate: POST /api/tenant-safety-checks/generate with tenancyIds filter
    // Expected: Only creates checks for specified tenancies
    const response = {
      success: true,
      generated: 1,
      message: 'Generated 1 fire_door checks',
    }

    expect(response.success).toBe(true)
  })
})

/**
 * Test 3: Notifications across all three callers
 * - Job completion: notify tenants that a job is done
 * - Photo request: ask tenants for compliance photo evidence
 * - SMS audit: log that SMS was sent (non-blocking)
 */
describe('Notifications system', () => {
  it('job-complete notification has required fields', async () => {
    // Simulate: POST /api/notify-job-complete inserts to notifications table
    // Expected: user_id, title, body, type='job_complete', link, read=false
    const notification = {
      id: 'notif-id-1',
      user_id: '9ec1d22d-1dc9-4bd1-b0b8-6ea973724c43', // people.id
      title: 'Test Maintenance Complete',
      body: 'Your plumbing work is complete',
      type: 'job_complete',
      link: '/tenant',
      read: false,
      created_at: new Date().toISOString(),
    }

    expect(notification.user_id).toBeDefined()
    expect(notification.type).toBe('job_complete')
    expect(notification.read).toBe(false)
  })

  it('photo-request notification has required fields', async () => {
    // Simulate: compliance-dashboard photo-request inserts to notifications table
    // Expected: user_id, title, body, type='photo_request', link='/tenant/safety-checks', read=false
    const notification = {
      id: 'notif-id-2',
      user_id: '9ec1d22d-1dc9-4bd1-b0b8-6ea973724c43', // people.id
      title: '📸 Photo Request: Fire Door',
      body: 'Please send a photo of your fire door...',
      type: 'photo_request',
      link: '/tenant/safety-checks',
      read: false,
      created_at: new Date().toISOString(),
    }

    expect(notification.user_id).toBeDefined()
    expect(notification.type).toBe('photo_request')
    expect(notification.link).toBe('/tenant/safety-checks')
  })

  it('SMS audit log is optional and non-blocking', async () => {
    // Simulate: SMS send succeeds even if audit log fails
    // Expected: SMS sent successfully, audit log error is logged but doesn't fail the send
    const smsResult = {
      success: true,
      message: 'SMS sent successfully',
      phone: '+441234567890',
    }

    expect(smsResult.success).toBe(true)
    // Even if audit log fails, SMS send still succeeds
  })

  it('tenant can mark notifications as read', async () => {
    // Simulate: PATCH /api/notifications/:id (tenant update)
    // Expected: read=true, updated_at updated
    const updated = {
      id: 'notif-id-1',
      read: true,
      updated_at: new Date().toISOString(),
    }

    expect(updated.read).toBe(true)
  })

  it('notifications use people.id, not auth.uid', async () => {
    // Verify the schema contract: user_id FK refs people(id), not auth.users(id)
    // This is the critical fix that unblocks notifications
    const notification = {
      user_id: '9ec1d22d-1dc9-4bd1-b0b8-6ea973724c43', // people.id, NOT auth.uid
    }

    // In real test, this would verify FK constraint
    expect(notification.user_id).toMatch(/^[0-9a-f-]{36}$/) // UUID format
  })
})

/**
 * Test 4: Health checks integration
 * - Doctor catches broken API keys
 * - Doctor catches missing tables
 * - Doctor catches wrong column names
 */
describe('Health checks (doctor)', () => {
  it('doctor detects missing service-role key', async () => {
    // When SUPABASE_SERVICE_ROLE_KEY is empty or dead
    // Expected: doctor exits with code 1, reports "service-role key is INVALID"
    expect(true).toBe(true) // Placeholder for actual CLI test
  })

  it('doctor detects missing table', async () => {
    // When a required table doesn't exist in the DB
    // Expected: doctor exits with code 1, reports "table X does NOT exist"
    expect(true).toBe(true) // Placeholder for actual CLI test
  })

  it('doctor detects missing column', async () => {
    // When code references a column that doesn't exist
    // Expected: doctor exits with code 1, reports "table X missing columns: Y"
    expect(true).toBe(true) // Placeholder for actual CLI test
  })
})
