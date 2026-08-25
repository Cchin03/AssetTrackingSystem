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
      render: (v) => {
        const reason = v as string | null | undefined
        return reason ? (
          <span className="text-gray-700 text-xs">{reason}</span>
        ) : (
          <span className="text-gray-400 italic text-xs">No reason given</span>
        )
      },
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