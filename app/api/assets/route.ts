/** app/api/assets/route.ts
 * Commented by Desmond @ 16-Feb-2026
 * This file contains GET, PUT, POST and UPDATE for the Asset table
 */

// NextRequest - user's request
// NextResponse - server response/reply
import { NextRequest, NextResponse } from 'next/server' 

/**
 * In the API routes, we should not use client Supabase because
 * - client.ts uses the anon key
 * - the anon key relies on RLS
 * - the API routes should not trust client RLS 
 * - we already validate the session using apiAuth.ts
 */
import { supabaseAdmin } from '@/lib/supabase/server'

// Check whether the user is logged in, authorized and role allowed
import { validateSession } from '@/lib/apiAuth'

// Best-effort audit logging — records who changed what, and when
import { logAudit } from '@/lib/auditLog'

// Commented by Desmond @ 26-April-26
// Import the TypeScript type definitions for the entire Supabase structure
import type { Database } from '@/lib/supabase/types'

// Zod is a schema validation library
// It ensures the user input matches the database structure to prevent bad data and attacks
import { z } from 'zod'

// Define the allowed asset conditions
const ALLOWED_CONDITIONS = ['In-use', 'In-store', 'Spoiled'] as const
// Create a TypeScript type where only the mentioned asset conditions are allowed as values
type AssetCondition = typeof ALLOWED_CONDITIONS[number]

// This method checks if the value is a string and in the allowed list
function isValidCondition(value: unknown): value is AssetCondition {
  return typeof value === 'string' &&
    (ALLOWED_CONDITIONS as readonly string[]).includes(value)
}

/** 
 * Commented by Desmond @ 15-Feb-2026
 * Zod schemas are used in form validation to validate user input on the client side
 * For instance, only allowed a certain length for user input
 * Nevertheless, the schemas are based on our database table structure
 */
const assetCreateSchema = z.object({
  asset_id: z.string().max(30),
  name: z.string().max(50),
  model: z.string().max(30),
  description: z.string().max(200).optional(),
  condition: z.enum(ALLOWED_CONDITIONS).optional(),
  location_id: z.string().max(30).nullable().optional(),
  department_id: z.string().max(30).nullable().optional(),
  category: z.string().max(50)
}).strict() // '.strict()' prevents attackers from sending extra properties

// The update schema is similar to create, but fields are optional to be updated
const assetUpdateSchema = z.object({
  asset_id: z.string().max(30), // asset_id is required
  name: z.string().max(50).optional(),
  model: z.string().max(30).optional(),
  description: z.string().max(200).optional(),
  condition: z.enum(ALLOWED_CONDITIONS).optional(),
  location_id: z.string().max(30).nullable().optional(),
  department_id: z.string().max(30).nullable().optional(),
  category: z.string().max(50).optional()
}).strict() // '.strict()' prevents attackers from sending extra properties

/**
 * Commented by Desmond @ 16-Feb-2026
 * This is a centralized safe JSON parsing method
 * to prevent crashes if an invalid JSON is sent
 */
async function safeJson(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** 
 * Commented by Desmond @ 16-Feb-2026
 * This is a method to quickly return an internal server error response
 */
function serverError() {
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 }
  )
}

/**********************
 * GET - Fetch assets
 *********************/
export async function GET(request: NextRequest) {
  // Read the session cookie and it returns 'authorized' either true or false
  const authResult = await validateSession()

  // If not authorized, return a response and exit
  if (!authResult.authorized) {
    return authResult.response
  }

  try {
    // Read the query parameters like page, limit and search field
    const { searchParams } = new URL(request.url)

    // Pagination with limits and a default number
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1)
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100)

    // Limit the user input for the search field to prevent too long of an input
    const search = (searchParams.get('search') || '').slice(0, 100)
    const condition = searchParams.get('condition') || ''

    // Search and filters
    const allowedSearchFields = ['asset_id', 'name', 'model', 'category']
    const searchField = allowedSearchFields.includes(
      searchParams.get('searchField') || ''
    )
      ? searchParams.get('searchField')!
      : 'name'

    const allowedSortFields = ['created_dt', 'updated_dt', 'name']
    const sortBy = allowedSortFields.includes(
      searchParams.get('sortBy') || ''
    )
      ? searchParams.get('sortBy')!
      : 'created_dt'

    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'

    // When ?deleted=true is passed, show only soft-deleted assets instead
    // of active ones — powers the "Deleted Assets" admin view so staff can
    // find and restore something that was removed by mistake (WC)
    const showDeleted = searchParams.get('deleted') === 'true'

    // Build database query
    let query = supabaseAdmin // Use Supabase admin to query the table
      .from('Asset') // Fetch from Asset table
      // Join the related tables - 'location' and 'department' using their primary key
      .select(`
        *,
        location:location_id(name, description),
        department:department_id(name)
      `, { count: 'exact' })
      /**
       * Commented by Desmond @ 11-Feb-2026
       * According to enterprise standards, it is better to have soft delete
       * to maintain a clear audit trail.
       * When a record is removed or no longer needed, a 'deleted_dt' is added
       * to mark deletion.
       * This line ensure only records with 'deleted_dt' empty/NULL
       * will be shown when queried.
       */
      // Toggle based on showDeleted — active assets (deleted_dt IS NULL) vs.
      // soft-deleted assets (deleted_dt IS NOT NULL) (WC)
    query = showDeleted
      ? query.not('deleted_dt', 'is', null)
      : query.is('deleted_dt', null)

    // Apply condition filter
    if (condition && isValidCondition(condition)) {
      query = query.eq('condition', condition)
    }

    // Apply search filter
    if (search) {
      query = query.ilike(searchField, `%${search}%`)
    }

    // Add sorting
    query = query.order(sortBy, { ascending: sortOrder === 'asc' })

    // Apply pagination
    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    // Run the SQL query
    const { data, error, count } = await query

    if (error) {
      /**
       * @params error.message - Access the error message directly, but if the error is 'null' or 'undefined'
       *                       - It crashes. Only use if error will exist
       * @params error?.message - Safely access the error if it exists (optional chaining)
       *                        - If the error is 'null' or 'undefined', it will not crash
       */
      console.error('Asset fetch error:', { message: error.message })
      return serverError()
    }

    // Return the response from the SQL query, such as 'data', 'totalItems' and 'totalPages'
    return NextResponse.json({
      data: data || [],
      totalItems: count || 0,
      totalPages: Math.ceil((count || 0) / limit)
    })
  } catch (error: any) { // Catch any error
    // console.error('GET /api/assets error:', error)
    /** 
     * Commented by Desmond @ 16-Feb-2026
     * Instead of displaying the exact error message to the user
     * which may expose the sensitive internal structure of the system
     * the user is presented with a safer error message
     * 
    */
    console.error('GET /api/assets error:', { message: error?.message })
    return serverError()
  }
}

/*************************
 * POST - Create an asset
 ************************/
export async function POST(request: NextRequest) {
  // Read the session cookie to check if the user is validated
  const authResult = await validateSession()

  // Return a response if user/session is not authorized and exit
  if (!authResult.authorized) {
    return authResult.response
  }

  try {
    // Safely parse the JSON
    const body = await safeJson(request)

    // Return an error response if the JSON is invalid
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Zod validation
    const parsed = assetCreateSchema.safeParse(body) // Validate input

    // Return error if validation failed
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Save parsed data once it is validated by Zod
    const input = parsed.data

    // Set the default asset condition to 'In-use' if the condition is invalid
    const condition: AssetCondition = 
      isValidCondition(input.condition) ? input.condition : 'In-use'

    /** Commented by Desmond @ 26-Mar-26
     * Generate and save the barcode
     */
    let tagPath: string | null = null

    try {
      const { generateAndUploadBarcode } = await import('@/lib/barcode/barcode')
      const barcodeResult = await generateAndUploadBarcode(input.asset_id, 'assets')
      tagPath = barcodeResult.tagPath

      console.log('Barcode created:', {
        assetId: input.asset_id.substring(0, 10),
        tagPath
      })
    } catch (barcodeError) {
      console.error('Barcode generation failed (continuing):', {
        assetId: input.asset_id.substring(0, 10),
        error: (barcodeError as Error).message
      })
      // tagPath is still null
    }

    // Build the database query
    const { data, error } = await supabaseAdmin
      .from('Asset')
      .insert([{ // Insert the record into the 'Asset' table
        asset_id: input.asset_id,
        tag_path: tagPath,
        name: input.name,
        model: input.model,
        description: input.description || '',
        condition,
        location_id: input.location_id || null,
        department_id: input.department_id || null,
        category: input.category,
        created_dt: new Date().toISOString(),
        created_by: authResult.session?.user?.staffId || null,
        updated_dt: new Date().toISOString(),
        deleted_dt: null
      }])
      .select()
      .single()

    // Return error responses if error occurred
    if (error) {
      // If the record already exists
      if (error.code === '23505') { // Unique key constraint violation
        return NextResponse.json(
          { error: 'Asset already exists' },
          { status: 400 }
        )
      }
      throw error
    }

    // Best-effort audit log — never blocks the response even if it fails.
    // Raw insert (not logAudit) so we can include a reason — logAudit's
    // helper signature doesn't expose that field (WC)
    try {
      const creationReason = data.condition === 'Spoiled'
        ? 'New asset found but spoiled'
        : 'New asset added'

      const { error: auditError } = await supabaseAdmin.from('AuditLog').insert({
        table_name: 'Asset',
        record_id: data.asset_id,
        action: 'CREATE',
        old_values: null,
        new_values: data,
        reason: creationReason,
        user_id: authResult.session?.user?.staffId || null,
      })
      if (auditError) {
        console.error('Failed to write audit log for asset creation:', auditError.message)
      }
    } catch (auditErr) {
      console.error('Unexpected error writing audit log:', auditErr)
    }

    // Return a success response when no failure
    return NextResponse.json(
      { success: true, data},
      { status: 201 } // Indicate a POST/PUT request is fulfilled
    )

    /**
     * Commented by Desmond @ 16-Feb-2026
     * ': any' is basically saying the error can be any data type 
     */
  } catch (error: any) {
    console.error('POST /api/assets error:', 
      { message: error?.message })
    return serverError()
  }
}

/************************
 * PUT - Update an asset
 ***********************/
export async function PUT(request: NextRequest) {
  // Read the session cookie to check if user is validated
  const authResult = await validateSession()

  // Return a response if the user/session is not authorized and exit
  if (!authResult.authorized) {
    return authResult.response
  }
  
  try {
    // Safely parse the JSON
    const body = await safeJson(request)

    // Return a response if the JSON is invalid
    if (!body) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Zod validation
    const parsed = assetUpdateSchema.safeParse(body) // Validate input

    // Return an error response when input is invalid
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // Save parsed data once it is validated by Zod
    const input = parsed.data
    // const { asset_id } = body
    const { asset_id } = input // Trust the validated input and not the raw body

    /**
     * Commented by Desmond @ 11-Feb-2026
     * Validate the asset condition to make sure it is allowed to be inserted
     * into the database
     */
    // if ('condition' in body && !ALLOWED_CONDITIONS.includes(body.condition)) {
    //   return NextResponse.json(
    //     { error: 'Invalid asset condition value. Must be In-use, In-store or Spoiled' },
    //     { status: 400 }
    //   )
    // }

    // Created a whitelist of database columns that the users are allowed to update
    const allowedFields = [
      'name',
      'model',
      'description',
      'condition',
      'location_id',
      'department_id',
      'category',
    ] as const

    /** Commented by Desmond @ 26-Feb-2026
     * Create an empty object to store valid field updates
     * @method updateData : Record<string, unknown> = {}
     * @params 'string' - key is a string
     * @params 'unknown' - value can be anything, 'unknown' is also safer than 'any' because it enforces type checking
     * '{}' means empty object 
     */
    const updateData: Partial<Database['public']['Tables']['Asset']['Update']> = {}

    // Loop through the allowed fields using for...of
    for (const field of allowedFields) { // Declare a 'field' variable
      /** Commented by Desmond @ 26-Feb-2026
       * Copy the valid field from the user input to 'updateData'
       * @params 'updateData[field]' - Adds the property dynamically like updateData["name"] = "Laptop"
       */
      const value = input[field as keyof typeof input]

      // Special validation for asset's 'condition' field (enum)
      if (value !== undefined) {
        // For non-enum fields, assign values directly to updateData
        updateData[field as keyof typeof updateData] = value as any
      }
    }

    // Check if nothing valid was provided
    if (Object.keys(updateData).length === 0) { // If the updateData length is 0
      /**
       * @params 'Object.keys' - Return list of object property names like ["name"] or ["model"]
       * @params '.length === 0' - Means object has no properties
       */

      // Return an error response because user sent nothing valid
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 } // 400 Bad request because user sent nothing valid
      )
    }

    // Automatically update the 'last modified time'
    updateData.updated_dt = new Date().toISOString() // Convert the date to standard database format

    // Fetch the row's current state before updating — needed as old_values
    // for the audit log. Also lets us return 404 early if it doesn't exist.
    const { data: beforeRow, error: beforeError } = await supabaseAdmin
      .from('Asset')
      .select('*')
      .eq('asset_id', asset_id)
      .is('deleted_dt', null)
      .single()

    if (beforeError || !beforeRow) {
      return NextResponse.json(
        { error: 'Asset not found or already deleted' },
        { status: 404 }
      )
    }

    // Build the database query
    const { data, error } = await supabaseAdmin // Supabase returns data and error
      .from('Asset')
      .update(updateData) // Update values
      .eq('asset_id', asset_id)
      /**
       * Commented by Desmond @ 11-Feb-2026
       * This new line prevents the user from updating deleted assets
       */
      .is('deleted_dt', null)
      .select() // Return the updated row
      .single() // Expect only one row; No row OR more than one row = error

    if (error) { // If database or SQL connection failed
      console.error('Supabase update error:', { message: error.message })
      throw error // Stop here and proceed to 'catch' block
    }

    if (!data) { // Check if asset exists, or if no row updated
      return NextResponse.json(
        { error: 'Asset not found or already deleted' },
        { status: 404 }
      )
    }

    // Best-effort audit log — never blocks the response even if it fails
    await logAudit({
      tableName: 'Asset',
      recordId: asset_id,
      action: 'UPDATE',
      oldValues: beforeRow,
      newValues: data,
      userId: authResult.session?.user?.staffId || null
    })

    return NextResponse.json( // Success response
      { success: true, data}
    )
  } catch (error: any) { // Handle unexpected crashes or any error
    // 'error?' means if error exists, get message; if not, don't crash
    console.error('PUT /api/assets error:', { message: error?.message })
    return serverError()
  }
}

/************************************************
 * DELETE - Soft delete to maintain audit trail
 *          by inserting a 'deleted_dt' into the
 *          record
 ***********************************************/
export async function DELETE(request: NextRequest) {
/**
 * @params export - Export as API endpoint : DELETE /api/assets
 * @params async = Allows 'await'
 * @params request: NextRequest - Incoming HTTP request object (contain the headers, body, URL and params)
 */
  const authResult = await validateSession('admin') // Only user with admin role can delete records

  if (!authResult.authorized) { // If the user is not allowed, stop
    return authResult.response // Error response
  }

  try {
    const { searchParams } = new URL(request.url) // Gets the query URL
    const asset_id = searchParams.get('asset_id') // Fetch the asset_id

    if (!asset_id) { // If asset_id is missing, return an error
      return NextResponse.json(
        { error: 'Asset ID is required' },
        { status: 400 }
      )
    }

    // Read the optional deletion reason sent by dynamicPage.tsx's delete
    // prompt. DELETE requests can carry a JSON body — parse defensively
    // since older clients (or curl/Postman testing) may send none at all (WC)
    let reason: string | null = null
    try {
      const body = await request.json()
      reason = typeof body?.reason === 'string' ? body.reason.trim() || null : null
    } catch {
      // No body sent — proceed with reason: null
    }

    // const { error } = await supabaseAdmin
    //   .from('Asset')
    //   .delete()
    //   .eq('asset_id', asset_id)
    /**
     * Commented by Desmond @ 11-Feb-2026
     * Instead of deleting a record, it sets a deleted_dt to mark it as removed
     */

    // Fetch the row's current state before soft-deleting — needed as
    // old_values for the audit log.
    const { data: beforeRow } = await supabaseAdmin
      .from('Asset')
      .select('*')
      .eq('asset_id', asset_id)
      .is('deleted_dt', null)
      .single()

    const { data, error } = await supabaseAdmin // Create the Supabase connection
      .from('Asset')
      .update(
        { deleted_dt: new Date().toISOString() } // Set a deleted_dt to the record
      )
      .eq('asset_id', asset_id) // Where it is the selected asset_id
      .is('deleted_dt', null) // Where the deleted_dt is empty
      .select() // Return a row
      .single() // Fetch a single record only

    if (error) { // If database connection failed, throw error
      console.error('Supabase delete error:', { message: error.message })
      throw error // Stop and go to catch block
    }

    if (!data) { // If data or item is missing, return error
      return NextResponse.json(
        { error: 'Asset not found or already deleted' },
        { status: 404 }
      )
    }

    // Best-effort audit log — never blocks the response even if it fails.
    // Raw insert (not logAudit) so we can include the deletion reason (WC)
    try {
      const { error: auditError } = await supabaseAdmin.from('AuditLog').insert({
        table_name: 'Asset',
        record_id: asset_id,
        action: 'DELETE',
        old_values: beforeRow ?? null,
        new_values: data, // now includes the deleted_dt timestamp
        reason,
        user_id: authResult.session?.user?.staffId || null,
      })
      if (auditError) {
        console.error('Failed to write audit log for asset deletion:', auditError.message)
      }
    } catch (auditErr) {
      console.error('Unexpected error writing audit log:', auditErr)
    }

    return NextResponse.json({ // Success response
        success: true, 
        message: 'Asset deleted successfully' 
      }
    )
  } catch (error: any) { // Catch and return any unexpected error
    console.error('DELETE /api/assets error:', { message: error?.message })
    return serverError()
  }
}

/****************************************
 * PATCH - Restore a soft-deleted asset
 * Usage: PATCH /api/assets?asset_id=A001
 ***************************************/
export async function PATCH(request: NextRequest) {
  // Only admins can restore, same restriction as delete
  const authResult = await validateSession('admin')

  if (!authResult.authorized) {
    return authResult.response
  }

  try {
    const { searchParams } = new URL(request.url)
    const asset_id = searchParams.get('asset_id')

    if (!asset_id) {
      return NextResponse.json(
        { error: 'Asset ID is required' },
        { status: 400 }
      )
    }

    // Fetch the row's current (deleted) state before restoring — needed as
    // old_values for the audit log (WC)
    const { data: beforeRow } = await supabaseAdmin
      .from('Asset')
      .select('*')
      .eq('asset_id', asset_id)
      .not('deleted_dt', 'is', null)
      .single()

    const { data, error } = await supabaseAdmin
      .from('Asset')
      .update({ deleted_dt: null, updated_dt: new Date().toISOString() })
      .eq('asset_id', asset_id)
      .not('deleted_dt', 'is', null) // Only restore rows that are actually deleted
      .select()
      .single()

    if (error) {
      console.error('Supabase restore error:', { message: error.message })
      throw error
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Asset not found or not deleted' },
        { status: 404 }
      )
    }

    // Best-effort audit log — never blocks the response even if it fails (WC)
    await logAudit({
      tableName: 'Asset',
      recordId: asset_id,
      action: 'RESTORE',
      oldValues: beforeRow ?? null,
      newValues: data,
      userId: authResult.session?.user?.staffId || null
    })

    return NextResponse.json({
      success: true,
      message: 'Asset restored successfully',
      data
    })
  } catch (error: any) {
    console.error('PATCH /api/assets error:', { message: error?.message })
    return serverError()
  }
}