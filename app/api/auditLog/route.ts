// app/api/auditLog/route.ts
// Read-only audit log listing — admins can browse who changed what, when.
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