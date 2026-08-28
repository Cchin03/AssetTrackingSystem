// app/(app)/admin/auditLog/page.tsx
'use client'

import { useState } from 'react'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import DynamicPage from '@/components/dynamicPage'
import type { dynamicPageConfig } from '@/components/dynamicPage'

// Helper: format date consistent with the rest of the admin pages
const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('en-MY', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

// Diff a before/after JSON pair down to only the fields that actually changed,
// so the log shows "condition: In-use → Spoiled" instead of two full JSON blobs.
function diffValues(
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
): { field: string; before: unknown; after: unknown }[] {
  if (!oldValues && !newValues) return []
  if (!oldValues) return Object.entries(newValues || {}).map(([field, after]) => ({ field, before: undefined, after }))
  if (!newValues) return Object.entries(oldValues).map(([field, before]) => ({ field, before, after: undefined }))

  const fields = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  const changed: { field: string; before: unknown; after: unknown }[] = []

  fields.forEach((field) => {
    const before = oldValues[field]
    const after = newValues[field]
    // Skip bookkeeping fields that always change and add noise to the diff
    if (['updated_dt', 'created_dt'].includes(field)) return
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changed.push({ field, before, after })
    }
  })

  return changed
}

function formatCellValue(value: unknown): string {
  if (value === undefined) return '—'
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Parses the "[Manual] ..." / "[AI Assessment]\n• ..." prefix that
// saveMaintenance writes into AuditLog.reason, so this column can show the
// same colored badge + bullet-point style as the Maintenance Review page's
// Response column, instead of a raw unlabeled string.
function parseReason(reason: string | null | undefined): {
  source: 'manual' | 'ai' | null
  text: string
  points: string[]
} {
  if (!reason) return { source: null, text: '', points: [] }

  if (reason.startsWith('[Manual]')) {
    return { source: 'manual', text: reason.replace('[Manual]', '').trim(), points: [] }
  }

  if (reason.startsWith('[AI Assessment]')) {
    const body = reason.replace('[AI Assessment]', '').trim()
    const points = body
      .split('\n')
      .map((line) => line.replace(/^[\s•\-*]+/, '').trim())
      .filter(Boolean)
    return { source: 'ai', text: body, points }
  }

  // Older entries written before the prefix was added — show as plain text
  return { source: null, text: reason, points: [] }
}

function ReasonCell({ reason }: { reason: string | null | undefined }) {
  const { source, text, points } = parseReason(reason)

  if (!source) {
    return text ? (
      <span className="text-gray-700 text-xs">{text}</span>
    ) : (
      <span className="text-gray-400 italic text-xs">No reason given</span>
    )
  }

  if (source === 'ai') {
    return (
      <div style={{ maxWidth: '220px' }} className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5 w-fit">
          AI Response
        </span>
        <ul className="space-y-1">
          {points.length > 0 ? points.map((point, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
              <span className="text-xs text-gray-700 leading-snug line-clamp-2">{point}</span>
            </li>
          )) : <li className="text-xs text-gray-400 italic">No details</li>}
        </ul>
      </div>
    )
  }

  // source === 'manual'
  return (
    <div style={{ maxWidth: '220px' }} className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5 w-fit">
        Staff feedback
      </span>
      <p className="text-xs text-gray-700 leading-snug line-clamp-3">{text}</p>
    </div>
  )
}

// Each row gets its own expand/collapse state since this is a real component
// (not just a render function) — clicking "Show more" on one row doesn't
// affect any other row.
function ChangesCell({
  oldValues,
  newValues,
}: {
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}) {
  const [expanded, setExpanded] = useState(false)
  const diff = diffValues(oldValues, newValues)

  if (diff.length === 0) {
    return <span className="text-xs text-gray-400 italic">No field changes</span>
  }

  const visible = expanded ? diff : diff.slice(0, 4)
  const hiddenCount = diff.length - visible.length

  return (
    <div style={{ maxWidth: '320px' }} className="space-y-1">
      {visible.map(({ field, before, after }) => (
        <div key={field} className="text-xs">
          <span className="font-medium text-gray-600">{field}:</span>{' '}
          <span className="text-red-500 line-through">{formatCellValue(before)}</span>
          {' → '}
          <span className="text-green-600">{formatCellValue(after)}</span>
        </div>
      ))}
      {diff.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {expanded ? 'Show less' : `+${hiddenCount} more field(s) — show all`}
        </button>
      )}
    </div>
  )
}

const auditLogConfig: dynamicPageConfig = {
  entityName: 'auditLog',
  entityDisplayName: 'Audit Log',
  entityDisplayNameSingular: 'Log Entry',
  apiEndpoint: '/api/auditLog',
  primaryKey: 'audit_id',
  pageTitle: 'Audit Log',
  pageDescription: 'Track who changed what, when, and why',
  defaultSortBy: 'created_dt',
  showAddButton: false, // read-only — entries are created automatically by other routes
  // Empty array suppresses the built-in Edit/Delete actions entirely — a log
  // is meant to be immutable. Requires the .length > 0 fix in dynamicPage.tsx
  // (an empty array previously still rendered a blank "Actions" column header).
  customActions: [],

  searchFields: [
    { key: 'record_id', label: 'Search by Record ID (e.g. Asset ID)' },
  ],

  columns: [
    {
      key: 'created_dt',
      label: 'When',
      sortable: true,
      render: (v) => <span className="text-gray-500 whitespace-nowrap">{formatDate(String(v))}</span>,
    },
    {
      key: 'staff',
      label: 'Who',
      sortable: false,
      render: (_v, row) => {
        const staff = row.staff as { name?: string; staff_id?: string } | null
        return staff?.name ? (
          <span className="font-medium text-gray-900">{staff.name}</span>
        ) : (
          <span className="text-gray-400 italic">Unknown ({String(row.user_id ?? '—')})</span>
        )
      },
    },
    {
      key: 'action',
      label: 'Action',
      sortable: false,
      render: (v) => {
        const action = v as string
        const styles: Record<string, string> = {
          CREATE: 'bg-green-100 text-green-800',
          UPDATE: 'bg-blue-100 text-blue-800',
          DELETE: 'bg-red-100 text-red-800',
          RESTORE: 'bg-yellow-100 text-yellow-800',
        }
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles[action] ?? 'bg-gray-100 text-gray-700'}`}>
            {action}
          </span>
        )
      },
    },
    {
      key: 'reason',
      label: 'Reason',
      sortable: false,
      render: (v) => <ReasonCell reason={v as string | null | undefined} />,
    },
    {
      // Readable, expandable diff — what actually changed
      key: 'new_values',
      label: 'Changes',
      sortable: false,
      render: (_v, row) => {
        const oldValues = row.old_values as Record<string, unknown> | null
        const newValues = row.new_values as Record<string, unknown> | null
        return <ChangesCell oldValues={oldValues} newValues={newValues} />
      },
    },
  ],

  formFields: [], // read-only page, no add/edit form
}

export default function AuditLogPage() {
  const { isLoading, isAdmin } = useAdminAccess()

  if (isLoading || !isAdmin) return null

  return <DynamicPage config={auditLogConfig} />
}