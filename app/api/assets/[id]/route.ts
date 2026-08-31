// app/api/assets/[id]/routes.ts
/**
 * @param NextRequest - represents the incoming HTTP request
 * @param NextResponse - lets you send HTTP responses
 * @param supabaseAdmin - use the service role key and run only on server
 * @param validateSession - check if the user is logged in and have the correct role
 */
import { NextRequest, NextResponse } from 'next/server'
/**
 * In the API routes, we should not use client Supabase because
 * - client.ts uses the anon key
 * - the anon key relies on RLS
 * - the API routes should not trust client RLS
 * - we already validate the session using apiAuth.ts
 */
import { supabaseAdmin } from '@/lib/supabase/server' // Supabase server
import { validateSession } from '@/lib/apiAuth' // Validate the user session

// Read an asset
/**
 * @exports - Next.js can see it
 * @async - wait for DB and authenticated first
 * @param id - comes from [id] in the URL (e.g., asset_id)
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Await the params to get the id
  const { id } = await params;

  // Read the session cookie and it returns 'authorized' either true or false
  const authResult = await validateSession();

  // If not authorized, return a response and exit
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    // Uses admin privileges to fetch from the Supabase table
    const { data, error } = await supabaseAdmin
    // Fetch from the asset table
      .from('Asset')
      // Select all fields, but join the location and department table
      .select(`
        *,
        location:location_id(location_id, name),
        department:department_id(department_id, name)
      `)
      .eq('asset_id', id)
      .is('deleted_dt', null) // Ensure only existing records are fetched 
      .single() // Expect one record

    // Return an error
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message }, 
        { status: 400 } // Bad request, client error but not server crash
      )
    }

    // Return success when no error
    return NextResponse.json(
      { success: true, data }
    )
  } catch (error) { // Catch any errors
    console.error('Error fetching asset:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' }, 
      { status: 500 } // Something unexpected happened
    )
  }
}

// Update an asset
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Await the params to get the id
  const { id } = await params;

  // Only admins can update
  const authResult = await validateSession('admin')

  // Returns a response when not authorized
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    // Parse request body
    const body = await request.json()
    // Allowed fields to update
    const updateData = {
      ...body,
      updated_dt: new Date().toISOString()
    }
    // Don't allow users to change the asset_id via client
    delete updateData.asset_id;
    // Use admin privileges to read from the Supabase table
    const { data, error } = await supabaseAdmin
    // Read from the asset table
      .from('Asset')
      .update(updateData) // Update only the asset in the URL
      .eq('asset_id', id)
      .is('deleted_dt', null) // Ensure only existing records can be updated
      .select(`
        *,
        location:location_id(location_id, name),
        department:department_id(department_id, name)
      `)
      .single() // Only fetch a single record

    // Return an error
    if (error) {
      return NextResponse.json(
        { success: false, error: error.message }, 
        { status: 400 }) // Bad request, client error but not server crash
    }
    // Return success when no error
    return NextResponse.json(
      { success: true, data }
    )
  } catch (error) { // Catch any error
    console.error('Error updating asset:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 } // Something unexpected happened
    )
  }
}