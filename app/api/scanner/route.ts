/** app/api/scanner/route.ts
 * API route for all scanner operations
 * Replaces direct Supabase client calls in the scanner page
 * to prevent database queries and table structure from being
 * visible in the browser's Network tab (developer tools)
 */

// NextRequest - the incoming request from the browser
// NextResponse - the response we send back
import { NextRequest, NextResponse } from 'next/server'

// supabaseAdmin uses the service role key (server-side only)
// Never exposed to the browser, unlike the anon key used by client.ts
import { supabaseAdmin } from '@/lib/supabase/server'

// validateSession checks if the user is logged in before allowing API access
import { validateSession } from '@/lib/apiAuth'

// Zod validates the request body so only expected fields are accepted
import { z } from 'zod'

// Commented by Desmond @ 26-April-26
// Import the TypeScript type definitions for the entire Supabase structure
import type { Database } from '@/lib/supabase/types'

// ============================================================
// ZOD SCHEMAS — define what data each action expects
// ============================================================

// Lookup a single record by scanned code (used for staff, asset, location, department)
const LookupSchema = z.object({
  table: z.enum(['Staff', 'Asset', 'Location', 'Department']), // only allow known tables
  idColumn: z.enum(['staff_id', 'asset_id', 'location_id', 'department_id']), // only known columns
  scannedCode: z.string().min(1).max(100).trim(), // the scanned barcode/QR value
})

// Check how many assets a staff member currently owns
const StaffAssetCountSchema = z.object({
  action: z.literal('count_staff_assets'),
  staffId: z.string().min(1).max(50).trim(),
})

// Check if an asset is already assigned to someone
const AssetAssignmentSchema = z.object({
  action: z.literal('check_asset_assignment'),
  assetId: z.string().min(1).max(100).trim(),
})

// Assign an asset to a staff member
const AssignSchema = z.object({
  action: z.literal('assign'),
  staffId: z.string().min(1).max(50).trim(),
  assetId: z.string().min(1).max(100).trim(),
})

// Unassign an asset from a staff member
const UnassignSchema = z.object({
  action: z.literal('unassign'),
  assignmentId: z.string().min(1).max(100).trim(),
})

// Update an asset's location or department
const TagAssetSchema = z.object({
  action: z.literal('tag_asset'),
  assetId: z.string().min(1).max(30).trim(),
  field: z.enum(['location_id', 'department_id']), // only allow these two fields to be updated
  value: z.string().min(1).max(100).trim(),
})

// Create a brand new asset record
const CreateAssetSchema = z.object({
  action: z.literal('create_asset'),
  asset_id: z.string().min(1).max(30).trim(),
  name: z.string().min(1).max(50).trim(),
  description: z.string().max(200).optional(),
  condition: z.enum(['In-use', 'In-store', 'Spoiled']),
  category: z.string().min(1).max(50).trim(),
  model: z.string().min(1).max(30).trim(),
  location_id: z.string().max(30).nullable().optional(),
  department_id: z.string().max(30).nullable().optional(),
  // Optional photo captured during registration — uploaded to the
  // AssetImage storage bucket and its URL saved into Asset.tag_path (WC)
  image_base64: z.string().nullable().optional(),
  image_mime: z.string().nullable().optional(),
  // Staff member registering the asset, so the AuditLog CREATE entry
  // can attribute who created it (WC)
  created_by: z.string().nullable().optional(),
})

// ============================================================
// GET — lookup a record by scanned code
// Usage: /api/scanner?table=Asset&idColumn=asset_id&scannedCode=A001
// ============================================================
export async function GET(req: NextRequest) {
  // Only logged-in users (staff or admin) can use the scanner
  const auth = await validateSession()
  if (!auth.authorized) return auth.response

  // Read query parameters from the URL
  const { searchParams } = new URL(req.url)
  const raw = {
    table: searchParams.get('table'),
    idColumn: searchParams.get('idColumn'),
    scannedCode: searchParams.get('scannedCode'),
  }

  // Validate the query parameters using Zod
  const parsed = LookupSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 })
  }

  const { table, idColumn, scannedCode } = parsed.data

  // Query the database — supabaseAdmin bypasses RLS, safe because we already validated session above
  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq(idColumn as string, scannedCode)
    .maybeSingle()

  if (error) {
    // Only log the message, not the full error object (prevents DB structure leaking in server logs)
    console.error({ message: error.message })
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ success: true, data })
}

// ============================================================
// POST — all write/update operations
// The 'action' field in the request body determines what to do
// ============================================================
export async function POST(req: NextRequest) {
  // Only logged-in users can perform scanner write operations
  const auth = await validateSession()
  if (!auth.authorized) return auth.response

  // Make sure the request has JSON content
  const contentType = req.headers.get('content-type')
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json' }, { status: 415 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Read the action field to determine which operation to run
  const action = (body as any)?.action

  // ----------------------------------------
  // ACTION: count_staff_assets
  // Returns how many assets a staff member owns
  // ----------------------------------------
  if (action === 'count_staff_assets') {
    const parsed = StaffAssetCountSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const { count, error } = await supabaseAdmin
      .from('StaffAsset')
      .select('*', { count: 'exact', head: true })
      .eq('staff_id', parsed.data.staffId)

    if (error) {
      console.error({ message: error.message })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: count ?? 0 })
  }

  // ----------------------------------------
  // ACTION: check_asset_assignment
  // Returns current assignment info for an asset
  // ----------------------------------------
  if (action === 'check_asset_assignment') {
    const parsed = AssetAssignmentSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('StaffAsset')
      .select('*')
      .eq('asset_id', parsed.data.assetId)

    if (error) {
      console.error({ message: error.message })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: data ?? [] })
  }

  // ----------------------------------------
  // ACTION: assign
  // Assign an asset to a staff member
  // ----------------------------------------
  if (action === 'assign') {
    const parsed = AssignSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const newId = `SA-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    const { error } = await supabaseAdmin
      .from('StaffAsset')
      .insert({ id: newId, staff_id: parsed.data.staffId, asset_id: parsed.data.assetId })

    if (error) {
      console.error({ message: error.message })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // ----------------------------------------
  // ACTION: unassign
  // Remove an asset assignment by assignment ID
  // ----------------------------------------
  if (action === 'unassign') {
    const parsed = UnassignSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('StaffAsset')
      .delete()
      .eq('id', parsed.data.assignmentId)

    if (error) {
      console.error({ message: error.message })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  }

  // ----------------------------------------
  // ACTION: tag_asset
  // Update an asset's location_id or department_id
  // ----------------------------------------
  // Commented by Desmond @ 26-April-26
  // Tagging an asset to a location or department
  if (action === 'tag_asset') {
    // Use the Zod validation schema to validate the raw JSON data sent by user's browser
    const parsed = TagAssetSchema.safeParse(body)
    // If parsing fails
    if (!parsed.success) {
      // Return an error 
      return NextResponse.json(
        { error: 'Invalid request' }, 
        { status: 400 })
    }

    // Destructure and pull the field column and value from the validated data
    const { field, value } = parsed.data

    // TypeScript type mapping which tells the compiler
    // what object is allowed, based on lib/supabase/type.ts
    const updateData: Database['public']['Tables']['Asset']['Update'] = {
      // Update the updated_dt column
      updated_dt: new Date().toISOString()
    }

    // Check the allowed listing before updating the value
    if (field === 'location_id') {
      updateData.location_id = value;
    } else if (field === 'department_id') {
      updateData.department_id = value;
    }

    // Database execution - await pauses the function execution
    // until Supabase returns a result
    const { error } = await supabaseAdmin
      // Query from the Asset table
      .from('Asset')
      // Only the fields present in updateData will be changed
      .update(updateData)
      // Update the specific asset_id
      .eq('asset_id', parsed.data.assetId)

    // Error handling and security
    if (error) {
      // Only developer can see the console error
      console.error({ message: error.message })
      // Return NextResponse error
      return NextResponse.json(
        { error: 'Database error' }, 
        { status: 500 }
      )
    }

    // If process ok, return success response
    return NextResponse.json(
      { success: true }
    )
  }

  // ----------------------------------------
  // ACTION: create_asset
  // Register a brand new asset into the database
  // ----------------------------------------
  if (action === 'create_asset') {
    const parsed = CreateAssetSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

    // Pull out fields that don't belong in the Asset insert itself —
    // 'action' is routing metadata, image_base64/image_mime are uploaded
    // separately below, and created_by is only used for the AuditLog entry (WC)
    const { action: _, image_base64, image_mime, created_by, ...assetData } = parsed.data

    // Upload the registration photo (if provided) BEFORE inserting the
    // asset, same pattern as saveMaintenance — bucket is shared (AssetImage) (WC)
    let tagPath: string | null = null
    if (image_base64) {
      try {
        const buffer = Buffer.from(image_base64, 'base64')
        const ext = image_mime === 'image/png' ? 'png' : image_mime === 'image/webp' ? 'webp' : 'jpg'
        const fileName = `${assetData.asset_id}_${Date.now()}.${ext}`

        const { error: uploadError } = await supabaseAdmin
          .storage
          .from('AssetImage')
          .upload(fileName, buffer, {
            contentType: image_mime ?? 'image/jpeg',
            upsert: false,
          })

        if (uploadError) {
          console.error('Asset registration image upload error:', uploadError)
        } else {
          const { data: urlData } = supabaseAdmin
            .storage
            .from('AssetImage')
            .getPublicUrl(fileName)
          tagPath = urlData.publicUrl
        }
      } catch (err) {
        console.error('Unexpected error uploading asset registration image:', err)
        // Image upload failing shouldn't block asset creation — continue without it (WC)
      }
    }

    const { error } = await supabaseAdmin
      .from('Asset')
      .insert({
        ...assetData,
        tag_path: tagPath,
        created_by: created_by ?? null,
        created_dt: new Date().toISOString(),
      })

    if (error) {
      console.error({ message: error.message })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Log the new asset in AuditLog — best-effort, doesn't fail the
    // request if it errors, since the asset itself is already saved (WC)
    try {
      const { error: auditError } = await supabaseAdmin.from('AuditLog').insert({
        table_name: 'Asset',
        record_id: assetData.asset_id,
        action: 'CREATE',
        old_values: null,
        new_values: {
          name: assetData.name,
          category: assetData.category,
          model: assetData.model,
          condition: assetData.condition,
          location_id: assetData.location_id ?? null,
          department_id: assetData.department_id ?? null,
        },
        reason: null,
        user_id: created_by ?? null,
      })

      if (auditError) {
        console.error('Failed to write audit log for asset creation:', auditError.message)
      }
    } catch (auditErr) {
      console.error('Unexpected error writing audit log:', auditErr)
    }

    return NextResponse.json({ success: true })
  }

  // If action doesn't match any known operation
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}