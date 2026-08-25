/** lib/auditLog.ts
 * @description Writes a single row to the AuditLog table whenever a tracked
 * record is created, updated, deleted, or restored.
 *
 * This is intentionally best-effort — same pattern as barcode generation in
 * POST /api/assets. A failed audit write should never block the actual
 * mutation (creating/updating/deleting an asset) that triggered it. If the
 * insert fails, it's logged to the server console and swallowed.
 *
 * DO NOT import this into client components — it uses supabaseAdmin.
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/types'

type AuditLogInsert = Database['public']['Tables']['AuditLog']['Insert']

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'

interface LogAuditParams {
  // Which table the change happened on, e.g. 'Asset', 'Staff'
  tableName: string
  // The primary key of the affected row, e.g. an asset_id or staff_id
  recordId: string
  action: AuditAction
  // Full row snapshot before the change (null for CREATE)
  oldValues?: Record<string, unknown> | null
  // Full row snapshot after the change (null for DELETE)
  newValues?: Record<string, unknown> | null
  // Staff who performed the action — should be a Staff.staff_id, not a Users.id
  userId?: string | null
  // Optional free-text reason, only sent if provided AND the AuditLog table
  // actually has a 'reason' column (see note below).
  reason?: string | null
}

export async function logAudit({
  tableName,
  recordId,
  action,
  oldValues = null,
  newValues = null,
  userId = null,
  reason
}: LogAuditParams): Promise<void> {
  try {
    // Base payload is typed exactly against the generated Insert shape —
    // this always compiles cleanly since it has no extra/missing keys.
    const basePayload: AuditLogInsert = {
      table_name: tableName,
      record_id: recordId,
      action,
      old_values: (oldValues as Json) ?? null,
      new_values: (newValues as Json) ?? null,
      user_id: userId,
      created_dt: new Date().toISOString()
    }

    // 'reason' isn't in the generated AuditLogInsert type yet (add it to
    // Database['public']['Tables']['AuditLog'] in types.ts once the column
    // exists, then this branch can go away). Supabase's insert() uses a
    // RejectExcessProperties check that rejects unknown keys structurally —
    // even on a typed variable, not just literals — so a plain intersection
    // type isn't enough here. Going through `unknown` intentionally bypasses
    // that check for this one optional field.
    const payload =
      reason !== undefined && reason !== null
        ? ({ ...basePayload, reason } as unknown as AuditLogInsert)
        : basePayload

    const { error } = await supabaseAdmin.from('AuditLog').insert([payload])

    if (error) {
      console.error('Audit log insert failed (continuing):', {
        tableName,
        recordId: recordId.substring(0, 30),
        action,
        message: error.message
      })
    }
  } catch (err) {
    console.error('Audit log insert threw (continuing):', {
      tableName,
      recordId: recordId.substring(0, 30),
      action,
      message: (err as Error).message
    })
  }
}