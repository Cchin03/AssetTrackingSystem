// app/(app)/admin/assetTracking/bulkImportAssets/page.tsx
'use client'

/**
 * @file bulkImportAssets/page.tsx
 * @description Lets an admin upload a CSV of assets and create them all at
 * once via POST /api/assets/bulk. Each row gets its own asset_id, and the
 * bulk API route generates a unique barcode per asset the same way the
 * single-asset add page does.
 *
 * Expected CSV header row (order doesn't matter, extra columns are ignored):
 *   asset_id,name,model,category,description,condition,location_id,department_id
 *
 * Only asset_id, name, model, category are required.
 * condition must be one of: In-use, In-store, Spoiled (optional — defaults to In-use)
 */

import { useState } from 'react'
import Link from 'next/link'
import { useAdminAccess } from '@/hooks/useAdminAccess'

const REQUIRED_COLUMNS = ['asset_id', 'name', 'model', 'category'] as const
const ALL_COLUMNS = [
  'asset_id', 'name', 'model', 'category',
  'description', 'condition', 'location_id', 'department_id',
  'created_dt', 'updated_dt'
] as const
const ALLOWED_CONDITIONS = ['In-use', 'In-store', 'Spoiled']

type AssetRow = Record<string, string>

interface ParsedRow {
  rowNumber: number
  data: AssetRow
  errors: string[]
}

interface BulkFailure {
  asset_id: string
  success: false
  error: string
}

interface BulkResponse {
  success: boolean
  summary: { total: number; created: number; failed: number }
  created: string[]
  failed: BulkFailure[]
  error?: string
}

// Minimal CSV line parser that handles quoted fields containing commas
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

// Parses "DD/MM/YYYY" or "DD/MM/YYYY H:mm[:ss]" (day-first — matches most
// non-US CSV exports) into a full ISO string. Also accepts anything already
// in ISO form (YYYY-MM-DD...). Returns null if the value can't be parsed.
//
// We do NOT use new Date(str) / Date.parse(str) directly for slash-separated
// dates — JS assumes MM/DD/YYYY for those, which silently produces the wrong
// date for day-first values (e.g. "12/4/2025" becomes Dec 4 instead of Apr 12)
// and only throws when the day happens to exceed 12.
function parseFlexibleDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  // Already ISO-ish (YYYY-MM-DD...) — unambiguous, let the Date constructor handle it
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const isoParsed = new Date(trimmed)
    return isNaN(isoParsed.getTime()) ? null : isoParsed.toISOString()
  }

  // DD/MM/YYYY, optionally followed by "H:mm" or "H:mm:ss"
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null

  const [, dStr, mStr, yStr, hStr = '0', minStr = '0', sStr = '0'] = match
  const day = parseInt(dStr, 10)
  const month = parseInt(mStr, 10)
  const year = parseInt(yStr, 10)
  const hour = parseInt(hStr, 10)
  const minute = parseInt(minStr, 10)
  const second = parseInt(sStr, 10)

  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // Treat the CSV's local wall-clock value as UTC directly — matches how
  // this data's own last_assessed_dt column pairs up with updated_dt
  // (e.g. "11/9/2024 2:38" ↔ "2024-09-11 02:38:54+00", same numbers, no offset shift).
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return isNaN(date.getTime()) ? null : date.toISOString()
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]).map(h => h.trim())

  return lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line)
    const data: AssetRow = {}
    headers.forEach((header, colIdx) => {
      if ((ALL_COLUMNS as readonly string[]).includes(header)) {
        data[header] = values[colIdx] ?? ''
      }
    })

    const errors: string[] = []
    for (const col of REQUIRED_COLUMNS) {
      if (!data[col] || data[col].trim() === '') {
        errors.push(`Missing ${col}`)
      }
    }
    if (data.asset_id && data.asset_id.length > 30) errors.push('asset_id exceeds 30 characters')
    if (data.name && data.name.length > 50) errors.push('name exceeds 50 characters')
    if (data.model && data.model.length > 30) errors.push('model exceeds 30 characters')
    if (data.category && data.category.length > 50) errors.push('category exceeds 50 characters')
    if (data.condition && !ALLOWED_CONDITIONS.includes(data.condition)) {
      errors.push(`condition must be one of: ${ALLOWED_CONDITIONS.join(', ')}`)
    }

    // Normalize created_dt/updated_dt to ISO in-place so downstream code
    // (handleSubmit) can send them straight to the API without re-parsing.
    if (data.created_dt) {
      const normalized = parseFlexibleDate(data.created_dt)
      if (!normalized) {
        errors.push('created_dt is not a valid date')
      } else {
        data.created_dt = normalized
      }
    }
    if (data.updated_dt) {
      const normalized = parseFlexibleDate(data.updated_dt)
      if (!normalized) {
        errors.push('updated_dt is not a valid date')
      } else {
        data.updated_dt = normalized
      }
    }

    return { rowNumber: idx + 2, data, errors } // +2 accounts for header row + 1-indexing
  })
}

function downloadTemplate() {
  const header = ALL_COLUMNS.join(',')
  const example = 'A001,Lenovo ThinkPad T480,T480,Laptop,14-inch business laptop,In-use,,,2024-01-15,2024-01-15'
  const csvContent = `${header}\n${example}\n`
  const blob = new Blob([csvContent], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'asset_import_template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export default function BulkImportAssetsPage() {
  const { isLoading, isAdmin } = useAdminAccess()

  const [rows, setRows] = useState<ParsedRow[]>([])
  const [fileName, setFileName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [result, setResult] = useState<BulkResponse | null>(null)

  if (isLoading || !isAdmin) {
    return null
  }

  const validRows = rows.filter(r => r.errors.length === 0)
  const invalidRows = rows.filter(r => r.errors.length > 0)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setResult(null)

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setRows(parseCsv(text))
    }
    reader.readAsText(file)
  }

  async function handleSubmit() {
    if (validRows.length === 0) return
    setIsSubmitting(true)
    setResult(null)

    try {
      const assets = validRows.map(r => {
        const asset: Record<string, string | undefined> = {
          asset_id: r.data.asset_id,
          name: r.data.name,
          model: r.data.model,
          category: r.data.category,
        }
        if (r.data.description) asset.description = r.data.description
        if (r.data.condition) asset.condition = r.data.condition
        if (r.data.location_id) asset.location_id = r.data.location_id
        if (r.data.department_id) asset.department_id = r.data.department_id
        if (r.data.created_dt) asset.created_dt = r.data.created_dt
        if (r.data.updated_dt) asset.updated_dt = r.data.updated_dt
        return asset
      })

      const res = await fetch('/api/assets/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assets })
      })

      const data: BulkResponse = await res.json()
      setResult(data)
    } catch (err) {
      setResult({
        success: false,
        summary: { total: validRows.length, created: 0, failed: validRows.length },
        created: [],
        failed: [],
        error: 'Network error — failed to reach the server.'
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Bulk Import Assets</h1>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
        <p className="mb-2">
          Upload a CSV with columns: 
        </p>
        <p className="mb-2">
          Required: <code>{REQUIRED_COLUMNS.join(', ')}</code>. Each row creates one asset with its own unique barcode.
        </p>
        <p className="mb-2">
          Optional: <code>created_dt</code> / <code>updated_dt</code> — accepts <code>DD/MM/YYYY</code>, <code>DD/MM/YYYY H:mm</code>, or full ISO datetime. Leave blank to use today&apos;s date.
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="text-blue-700 underline hover:text-blue-900"
        >
          Download CSV template
        </button>
      </div>

      <div className="bg-white border border-gray-300 rounded-md p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Select CSV file
        </label>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-red-600 file:text-white file:text-sm hover:file:bg-red-700"
        />
        {fileName && <p className="mt-2 text-xs text-gray-500">Loaded: {fileName}</p>}
      </div>

      {rows.length > 0 && (
        <div className="bg-white border border-gray-300 rounded-md p-6 space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="text-gray-700">Total rows: <strong>{rows.length}</strong></span>
            <span className="text-green-700">Valid: <strong>{validRows.length}</strong></span>
            <span className="text-red-700">Invalid: <strong>{invalidRows.length}</strong></span>
          </div>

          {invalidRows.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-red-200 rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-red-50 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2">asset_id</th>
                    <th className="text-left p-2">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {invalidRows.map(r => (
                    <tr key={r.rowNumber} className="border-t border-red-100">
                      <td className="p-2">{r.rowNumber}</td>
                      <td className="p-2">{r.data.asset_id || '—'}</td>
                      <td className="p-2 text-red-700">{r.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || validRows.length === 0}
            className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSubmitting ? `Creating ${validRows.length} assets...` : `Create ${validRows.length} valid assets`}
          </button>
        </div>
      )}

      {result && (
        <div className={`rounded-md p-4 border ${result.summary.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          {result.error ? (
            <p className="text-sm text-red-700">{result.error}</p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900 mb-2">
                {result.summary.created} of {result.summary.total} assets created successfully.
              </p>
              {result.failed.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto text-xs">
                  {result.failed.map(f => (
                    <p key={f.asset_id} className="text-red-700">
                      {f.asset_id}: {f.error}
                    </p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}