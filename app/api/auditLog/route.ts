// app/api/auditLog/route.ts
// Admins can browse who changed what, when (GET). Server-side code can also
// write new audit entries (POST) whenever a tracked table is created, updated,
// deleted, or restored.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { validateSession } from '@/lib/apiAuth'

const ALLOWED_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'RESTORE'] as const
type AuditAction = typeof ALLOWED_ACTIONS[number]

function isValidAction(value: string): value is AuditAction {
  return (ALLOWED_ACTIONS as readonly string[]).includes(value)
}

export async function GET(request: NextRequest) {
  // Only admins can view the audit trail
  const authResult = await validateSession('admin')
  if (!authResult.authorized) return authResult.response

  try {
    const { searchParams } = new URL(request.url)

    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 200)

    // Optional filters
    const tableName = (searchParams.get('table_name') || '').slice(0, 50)
    const recordId = (searchParams.get('record_id') || '').slice(0, 30)
    const userId = (searchParams.get('user_id') || '').slice(0, 30)

    const actionParam = searchParams.get('action') || ''
    const safeAction:  AuditAction | null = isValidAction(actionParam) ? actionParam : null

    // Joins the Staff table so the UI can show a name instead of a raw staff_id.
    // This relies on the auditlog_user_id_fkey FK you added — same requirement
    // as the department:department_id(name) join on /api/staff.
    let query = supabaseAdmin
      .from('AuditLog')
      .select('*, staff:user_id(name, staff_id)', { count: 'exact' })

    if (tableName) query = query.eq('table_name', tableName)
    if (recordId) query = query.ilike('record_id', `%${recordId}%`)
    if (userId) query = query.eq('user_id', userId)
    if (safeAction) query = query.eq('action', safeAction)

    query = query.order('created_dt', { ascending: false })

    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: data || [],
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    })
  } catch (error: any) {
    console.error('GET /api/auditLog error:', { message: error?.message })
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })
  }
}

// ----------------------------------------------------------------
//                     POST /api/auditLog
// ----------------------------------------------------------------
// Inserts a new audit trail entry. Intended to be called from OTHER
// server-side API routes (e.g. saveMaintenance) right after a tracked
// table is modified — not directly from the client.
//
// Body shape:
// {
//   table_name: string   (required, max 50 chars, e.g. "Asset")
//   record_id: string    (required, max 30 chars, e.g. the asset_id)
//   action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE'  (required)
//   old_values?: object | null   (jsonb — state before the change)
//   new_values?: object | null   (jsonb — state after the change)
//   reason?: string | null
//   user_id?: string | null      (must match an existing Staff.staff_id, or null)
// }
export async function POST(request: NextRequest) {
  // Any authenticated staff member can trigger a log entry (the action itself
  // is what's restricted elsewhere, e.g. by validateSession() in the route
  // that performs the actual update). Adjust the role here if you want to
  // lock this down further.
  const authResult = await validateSession()
  if (!authResult.authorized) return authResult.response

  try {
    const body = await request.json()
    const { table_name, record_id, action, old_values, new_values, reason, user_id } = body

    if (!table_name || !record_id || !isValidAction(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid audit log payload: table_name, record_id, and a valid action are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('AuditLog')
      .insert({
        table_name: String(table_name).slice(0, 50),
        record_id: String(record_id).slice(0, 30),
        action,
        old_values: old_values ?? null,
        new_values: new_values ?? null,
        reason: reason ?? null,
        user_id: user_id ?? null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('POST /api/auditLog error:', { message: error?.message })
    return NextResponse.json({ success: false, error: 'Failed to write audit log' }, { status: 500 })
  }
}