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

    const { action: _, ...assetData } = parsed.data // remove 'action' field before inserting

    // Generate and upload the Code128 barcode PNG for this asset — same
    // helper and 'assets' folder used by the admin Add Asset flow
    // (app/api/assets/route.ts), so scanner-registered assets get a
    // barcode graphic in the Assets listing just like manually-added ones.
    // Best-effort: if generation fails, tag_path stays null rather than
    // blocking asset creation (WC)
    let tagPath: string | null = null
    try {
      const { generateAndUploadBarcode } = await import('@/lib/barcode/barcode')
      const barcodeResult = await generateAndUploadBarcode(assetData.asset_id, 'assets', assetData.name)
      tagPath = barcodeResult.tagPath
    } catch (barcodeError) {
      console.error('Barcode generation failed (continuing):', {
        assetId: assetData.asset_id.substring(0, 10),
        error: (barcodeError as Error).message,
      })
    }

    // Attribute the creation to the logged-in user via their validated
    // session, not a client-supplied field (can't be spoofed) (WC)
    const staffId = auth.session?.user?.staffId ?? null

    const { data, error } = await supabaseAdmin
      .from('Asset')
      .insert({
        ...assetData,
        tag_path: tagPath,
        created_by: staffId,
        created_dt: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error({ message: error.message })
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Best-effort audit log — never blocks the response even if it fails.
    // Raw insert (not logAudit) so we can include a reason, matching the
    // same condition-aware phrasing used by the admin Add Asset flow
    // in app/api/assets/route.ts (WC)
    try {
      const creationReason = data.condition === 'Spoiled'
        ? 'New asset found but spoiled'
        : 'New asset added'

      const { error: auditError } = await supabaseAdmin.from('AuditLog').insert({
        table_name: 'Asset',
        record_id: assetData.asset_id,
        action: 'CREATE',
        old_values: null,
        new_values: data,
        reason: creationReason,
        user_id: staffId,
      })
      if (auditError) {
        console.error('Failed to write audit log for asset creation:', auditError.message)
      }
    } catch (auditErr) {
      console.error('Unexpected error writing audit log:', auditErr)
    }

    return NextResponse.json({ success: true, data })
  }

  // If action doesn't match any known operation
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}