// app/api/assets/[id]/route.ts
//
// IMPORTANT: this file MUST be named exactly "route.ts" (singular), not
// "routes.ts". Next.js's App Router only recognizes the exact filename
// "route.ts" as a route handler — a file named "routes.ts" is silently
// ignored, meaning GET/PUT requests to /api/assets/[id] would 404 or fall
// through to nothing. If your project currently has a file named
// "routes.ts" in this folder, delete it and replace it with this file
// under the correct name. (WC)

/**
 * @param NextRequest - represents the incoming HTTP request
 * @param NextResponse - lets you send HTTP responses
 * @param supabaseAdmin - use the service role key and run only on server
 * @param validateSession - check if the user is logged in and have the correct role
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { validateSession } from '@/lib/apiAuth'

// Read a single asset by its asset_id — used by the Edit page and the
// new Delete Asset confirmation page to show full details before acting (WC)
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authResult = await validateSession();
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('Asset')
      .select(`
        *,
        location:location_id(location_id, name),
        department:department_id(department_id, name)
      `)
      .eq('asset_id', id)
      .is('deleted_dt', null)
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: true, data }
    )
  } catch (error) {
    console.error('Error fetching asset:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Update an asset
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const authResult = await validateSession('admin')
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const body = await request.json()
    const updateData = {
      ...body,
      updated_dt: new Date().toISOString()
    }
    delete updateData.asset_id;

    const { data, error } = await supabaseAdmin
      .from('Asset')
      .update(updateData)
      .eq('asset_id', id)
      .is('deleted_dt', null)
      .select(`
        *,
        location:location_id(location_id, name),
        department:department_id(department_id, name)
      `)
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 })
    }
    return NextResponse.json(
      { success: true, data }
    )
  } catch (error) {
    console.error('Error updating asset:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}