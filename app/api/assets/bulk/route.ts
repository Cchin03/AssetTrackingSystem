/** app/api/assets/bulk/route.ts
 * Bulk asset creation — same validation/insert/barcode logic as POST /api/assets,
 * but accepts an array of assets in one request. Each asset gets its own
 * unique barcode (generated from its asset_id, same as the single-create route).
 *
 * Processes items in small concurrent batches (not all-at-once, not fully
 * sequential) so 100+ assets don't take forever, but also don't overwhelm
 * Supabase Storage with 100 simultaneous uploads.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { validateSession } from '@/lib/apiAuth'
import { z } from 'zod'

const ALLOWED_CONDITIONS = ['In-use', 'In-store', 'Spoiled'] as const
type AssetCondition = typeof ALLOWED_CONDITIONS[number]

function isValidCondition(value: unknown): value is AssetCondition {
  return typeof value === 'string' &&
    (ALLOWED_CONDITIONS as readonly string[]).includes(value)
}

// Same shape as the single-create schema in /api/assets/route.ts, plus
// optional created_dt/updated_dt so bulk imports can preserve real dates
// (e.g. historical asset acquisition dates) instead of always using "now".
const assetCreateSchema = z.object({
  asset_id: z.string().min(1).max(30),
  name: z.string().max(50),
  model: z.string().max(30),
  description: z.string().max(200).optional(),
  condition: z.enum(ALLOWED_CONDITIONS).optional(),
  location_id: z.string().max(30).nullable().optional(),
  department_id: z.string().max(30).nullable().optional(),
  category: z.string().max(50),
  // Accepts a full ISO datetime ("2024-01-15T00:00:00Z") or a plain date
  // ("2024-01-15") — either is normalized to a valid ISO string before insert.
  // Omit the field entirely to fall back to the current time at import.
  created_dt: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'created_dt must be a valid date' }
  ).optional(),
  updated_dt: z.string().refine(
    (val) => !isNaN(Date.parse(val)),
    { message: 'updated_dt must be a valid date' }
  ).optional()
}).strict()

// Wrap the whole request body: { assets: [...] }
const bulkCreateSchema = z.object({
  assets: z.array(assetCreateSchema).min(1, 'At least one asset is required').max(500, 'Maximum 500 assets per request')
})

async function safeJson(request: NextRequest) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function serverError() {
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

interface AssetInput {
  asset_id: string
  name: string
  model: string
  description?: string
  condition?: AssetCondition
  location_id?: string | null
  department_id?: string | null
  category: string
  created_dt?: string
  updated_dt?: string
}

interface CreateResult {
  asset_id: string
  success: boolean
  error?: string
}

// Create a single asset (same logic as the single POST route)
async function createOneAsset(input: AssetInput, createdBy: string | null): Promise<CreateResult> {
  const condition: AssetCondition = isValidCondition(input.condition) ? input.condition : 'In-use'

  // Barcode generation is best-effort — same as the single-create route.
  // A barcode failure should not block the asset record from being created.
  let tagPath: string | null = null
  try {
    const { generateAndUploadBarcode } = await import('@/lib/barcode/barcode')
    const barcodeResult = await generateAndUploadBarcode(input.asset_id, 'assets', input.name)
    tagPath = barcodeResult.tagPath
  } catch (barcodeError) {
    console.error('Bulk barcode generation failed (continuing):', {
      assetId: input.asset_id.substring(0, 10),
      error: (barcodeError as Error).message
    })
  }

  // Use the CSV-provided date if present (normalized to a proper ISO string),
  // otherwise fall back to the current time — same behavior as the single-add route.
  const now = new Date().toISOString()
  const createdDt = input.created_dt ? new Date(input.created_dt).toISOString() : now
  const updatedDt = input.updated_dt ? new Date(input.updated_dt).toISOString() : now

  const { error } = await supabaseAdmin
    .from('Asset')
    .insert([{
      asset_id: input.asset_id,
      tag_path: tagPath,
      name: input.name,
      model: input.model,
      description: input.description || '',
      condition,
      location_id: input.location_id || null,
      department_id: input.department_id || null,
      category: input.category,
      created_dt: createdDt,
      created_by: createdBy,
      updated_dt: updatedDt,
      deleted_dt: null
    }])

  if (error) {
    if (error.code === '23505') {
      return { asset_id: input.asset_id, success: false, error: 'Asset ID already exists' }
    }
    return { asset_id: input.asset_id, success: false, error: error.message }
  }

  return { asset_id: input.asset_id, success: true }
}

// Run promises with a concurrency cap so we don't fire 100+ uploads at once
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<CreateResult>): Promise<CreateResult[]> {
  const results: CreateResult[] = []
  let index = 0

  async function next(): Promise<void> {
    const current = index++
    if (current >= items.length) return
    results[current] = await worker(items[current])
    return next()
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => next())
  await Promise.all(runners)
  return results
}

/*******************************
 * POST - Bulk create assets
 ******************************/
export async function POST(request: NextRequest) {
  const authResult = await validateSession()
  if (!authResult.authorized) {
    return authResult.response
  }

  try {
    const body = await safeJson(request)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = bulkCreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { assets } = parsed.data

    // Reject duplicate asset_ids within the same batch before hitting the DB at all
    const seen = new Set<string>()
    const duplicatesInBatch: string[] = []
    for (const asset of assets) {
      if (seen.has(asset.asset_id)) duplicatesInBatch.push(asset.asset_id)
      seen.add(asset.asset_id)
    }
    if (duplicatesInBatch.length > 0) {
      return NextResponse.json(
        { error: 'Duplicate asset_id values within the same request', duplicates: duplicatesInBatch },
        { status: 400 }
      )
    }

    const createdBy = authResult.session?.user?.staffId || null

    // 5 concurrent inserts+barcode-uploads at a time — tune this if needed
    const results = await runWithConcurrency(assets, 5, (asset) => createOneAsset(asset, createdBy))

    const created = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    return NextResponse.json(
      {
        success: failed.length === 0,
        summary: {
          total: results.length,
          created: created.length,
          failed: failed.length
        },
        created: created.map(r => r.asset_id),
        failed
      },
      { status: failed.length === 0 ? 201 : 207 } // 207 Multi-Status: some succeeded, some didn't
    )
  } catch (error: any) {
    console.error('POST /api/assets/bulk error:', { message: error?.message })
    return serverError()
  }
}