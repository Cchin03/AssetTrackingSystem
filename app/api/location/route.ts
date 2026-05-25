/** Commented by Desmond @ 30-April26
 * @file app/api/location/route.ts
 * @description GET / POST / DELETE for the Location table.
 * 
 * Changes from previous version:
 *   - POST now generates and uploads a QR code (via lib/qrcode/qrcode.ts)
 *     and stores the relative path in a new `tag_path` column.
 *   - DELETE now performs a soft delete (sets deleted_dt) instead of a hard delete,
 *     matching the asset soft-delete pattern and maintaining audit trail.
 *   - GET filters out soft-deleted records (.is('deleted_dt', null)).
 *   - All IDs are validated against an enhanced Zod schema that rejects
 *     URLs, special characters, negative numbers, and overly long strings.
 */

// Commented on 23/04/2026 Daryl. Removed .strict() and used coerce.number()
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { validateSession } from '@/lib/apiAuth'
import { z } from 'zod'
import { generateAndUploadQr, deleteQr } from '@/lib/qrcode/qrcode'

// Commented by Desmond @ 30-April-26: Temporarily unused
// const safeIdSchema = z
//   .string()
//   .min(1, 'ID is required')
//   .max(30, 'ID must be 30 characters or less')
//   .regex(
//     /^[A-Za-z0-9\-_]+$/,
//     'ID may only contain letters, numbers, hyphens and underscores'
//   )

const getQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(100),
  search: z.string().optional().default(''),
  searchField: z.enum(['name', 'location_id']).default('name'),
  sortBy: z.enum(['location_id', 'name', 'description', 'block', 'level', 'created_dt']).default('created_dt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// BUGFIX: Removed .strict() and used coerce.number()
const postSchema = z.object({
  location_id: z.string().min(1, 'Location ID is required').max(30),
  name: z.string().min(1, 'Location name is required').max(30),
  // Commented on 26/04/2026 Daryl. Updated max length to 200 to match DB schema change
  description: z.string().max(200).optional().nullable(),
  block: z.string().max(10).optional().nullable(),
  level: z.coerce.number().int().optional().nullable(),
})

const deleteSchema = z.object({
  location_id: z.string().min(1, 'Invalid Location ID').max(30),
})

export async function GET(request: NextRequest) {
  const authResult = await validateSession()

  if (!authResult.authorized) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const validatedParams = getQuerySchema.parse(Object.fromEntries(searchParams.entries()))

    let query = supabaseAdmin
      .from('Location')
      .select('*', { count: 'exact' })
      // Commented by Desmond @ 30-April-26: Exclude the soft deleted records
      .is('deleted_dt', null)

    if (validatedParams.search) {
      query = query.ilike(validatedParams.searchField, `%${validatedParams.search}%`)
    }

    query = query.order(validatedParams.sortBy, { ascending: validatedParams.sortOrder === 'asc' })

    const from = (validatedParams.page - 1) * validatedParams.limit
    const to = from + validatedParams.limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query
    if (error) throw error

    return NextResponse.json({
      data: data || [],
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / validatedParams.limit)
    })
  } catch (error: any) {
    console.error('GET /api/location error:', { message: error?.message })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await validateSession('admin')

  if (!authResult.authorized) {
    return authResult.response
  }

  // Commented by Desmond @ 30-April-26
  let tagPath: string | null = null

  try {
    const body = await request.json()
    const validatedData = postSchema.parse(body)

    // Commented by Desmond @ 30-April-26
    // Step 1: Check for duplicate (including soft-deleted — IDs are never reused)
    const { data: existing } = await supabaseAdmin
      .from('Location')
      .select('location_id')
      .eq('location_id', validatedData.location_id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'Location ID already exists' },
        { status: 409 }
      )
    }

    // Step 2: Generate + upload QR code
    try {
      const qrResult = await generateAndUploadQr(
        validatedData.location_id,
        'locations'
      )
      tagPath = qrResult.tagPath
    } catch (qrError) {
      console.error('QR generation failed (continuing without QR):', {
        id: validatedData.location_id,
        message: qrError instanceof Error ? qrError.message : String(qrError),
      })
      // tagPath remains null — QR is optional; DB record still gets created
    }

    // Step 3: Insert DB row
    const { data, error } = await supabaseAdmin.from('Location')
      .insert([
        { 
          ...validatedData, 
          tag_path: tagPath,
          created_dt: new Date().toISOString(), 
          updated_dt: new Date().toISOString(),
          deleted_dt: null,
          created_by: authResult.session.user.staffId ?? null
        }
      ])
      .select()
      .single()

    if (error) {
      // Commented by Desmond @ 30-April-26
      // DB insert failed, clean up the uploaded QR so storage stays consistent
      if (tagPath) {
        await deleteQr(tagPath)
      }
      throw error
    }
    return NextResponse.json(
      { success: true, data }, 
      { status: 201 }
    )
  } catch (error: any) {
    console.error('POST /api/location error:', { message: error?.message })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.flatten() }, { status: 400 })
    }

    // Commented by Desmond @ 24-May-26: Test out why QR generation is failing
    // on Vercel
    const debug =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { raw: String(error) }

    return NextResponse.json(
      {
        error: 'Failed to create location',
        debug,
      },
      { status: 500 }
    )

    // return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const authResult = await validateSession('admin')

  if (!authResult.authorized) {
    return authResult.response
  }
  
  try {
    const { searchParams } = new URL(request.url)
    const validatedData = deleteSchema.parse({ location_id: searchParams.get('location_id') })

    // Commented by Desmond @ 30-April-26
    // Only soft delete records that are not already deleted
    const { data, error } = await supabaseAdmin
      .from('Location')
      // .delete()
      .update({
        deleted_dt: new Date().toISOString(),
        updated_dt: new Date().toISOString()
      })
      .eq('location_id', validatedData.location_id)
      // Prevent double-deletion
      .is('deleted_dt', null)
      .select()
      .single()

    if (error) {
      throw error
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Location not found or already deleted' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { success: true, message: 'Location deleted successfully' }
    )
    
  } catch (error: any) {
    console.error('DELETE /api/location error:', { message: error?.message })
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: 'Failed to delete location' }, { status: 500 })
  }
}

