// app/api/staff/route.ts
// Single staff API route that handles GET, POST, PUT and DELETE.
// This replaces the old split routes (staff/list, staff/add, staff/update) so DynamicPage works correctly.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { validateSession } from '@/lib/apiAuth'
import { z } from 'zod'

const staffCreateSchema = z.object({
  staff_id: z.string().min(1).max(30).regex(/^\d+$/, 'Staff ID must be digits only'),
  name: z.string().min(1).max(60),
  email: z.string().email().max(60),
  mobile_no: z.string().min(1).max(20),
  department_id: z.string().min(1).max(30),
})

const staffUpdateSchema = z.object({
  staff_id: z.string().min(1).max(30),
  name: z.string().max(60).optional(),
  email: z.string().email().max(60).optional(),
  mobile_no: z.string().max(20).optional(),
  department_id: z.string().max(30).optional(),
})

// Returns paginated staff list showing approved staff only
export async function GET(request: NextRequest) {
  const authResult = await validateSession('admin')
  if (!authResult.authorized) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 500)
    const search = (searchParams.get('search') || '').slice(0, 100)
    const allowedSearchFields = ['staff_id', 'name', 'email']
    const searchField = allowedSearchFields.includes(searchParams.get('searchField') || '')
      ? searchParams.get('searchField')!
      : 'name'
    const allowedSortFields = ['created_dt', 'name', 'staff_id']
    const sortBy = allowedSortFields.includes(searchParams.get('sortBy') || '')
      ? searchParams.get('sortBy')!
      : 'created_dt'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    let query = supabaseAdmin
      .from('Staff')
      .select('*, department:department_id(name)', { count: 'exact' })
      .eq('status', 'approved')

    if (search) query = query.ilike(searchField, `%${search}%`)
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })
    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      data: data || [],
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    })
  } catch (error: any) {
    console.error('GET /api/staff error:', { message: error?.message })
    return NextResponse.json({ error: 'Failed to fetch staff list' }, { status: 500 })
  }
}

// Admin adding staff directly so status is set to approved immediately
export async function POST(request: NextRequest) {
  const authResult = await validateSession('admin')
  if (!authResult.authorized) return authResult.response

  try {
    const body = await request.json()
    const parsed = staffCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { staff_id, name, email, mobile_no, department_id } = parsed.data

    const { data: existing } = await supabaseAdmin.from('Staff').select('staff_id').eq('staff_id', staff_id).single()
    if (existing) return NextResponse.json({ error: 'Staff ID already exists' }, { status: 409 })

    const { data, error } = await supabaseAdmin
      .from('Staff')
      .insert([{
        staff_id, name, email, mobile_no, department_id,
        status: 'approved',
        role: 'staff',
        microsoft_user_id: null,
        created_dt: new Date().toISOString(),
        updated_dt: new Date().toISOString()
      }])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Staff ID already exists' }, { status: 409 })
      throw error
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch (error: any) {
    console.error('POST /api/staff error:', { message: error?.message })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Updates a staff member, only admins can do this
export async function PUT(request: NextRequest) {
  const authResult = await validateSession('admin')
  if (!authResult.authorized) return authResult.response

  try {
    const body = await request.json()
    const parsed = staffUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
    }

    const { staff_id, ...updateFields } = parsed.data

    const { data, error } = await supabaseAdmin
      .from('Staff')
      .update({ ...updateFields, updated_dt: new Date().toISOString() })
      .eq('staff_id', staff_id)
      .select()
      .single()

    if (error) {
      console.error('PUT /api/staff error:', { message: error.message })
      return NextResponse.json({ error: 'Failed to update staff member' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('PUT /api/staff error:', { message: error?.message })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Deletes a staff member by staff_id, only admins can do this
export async function DELETE(request: NextRequest) {
  const authResult = await validateSession('admin')
  if (!authResult.authorized) return authResult.response

  try {
    const { searchParams } = new URL(request.url)
    const staff_id = searchParams.get('staff_id')

    if (!staff_id) return NextResponse.json({ error: 'Staff ID is required' }, { status: 400 })

    const { error } = await supabaseAdmin.from('Staff').delete().eq('staff_id', staff_id)

    if (error) {
      console.error('DELETE /api/staff error:', { message: error.message })
      return NextResponse.json({ error: 'Failed to delete staff member' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Staff member deleted successfully' })
  } catch (error: any) {
    console.error('DELETE /api/staff error:', { message: error?.message })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
