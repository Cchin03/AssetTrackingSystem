// app/(app)/admin/assetTracking/assets/deleted/page.tsx
'use client'

/**
 * @file deleted/page.tsx
 * @description Lists soft-deleted assets (deleted_dt IS NOT NULL) and lets
 * an admin restore one. Mirrors the pattern used by the Maintenance Review
 * page's Approve/Reject/Reopen actions — same DynamicPage + customActions
 * shape, just calling PATCH /api/assets instead. (WC)
 *
 * Related files:
 *  - app/api/assets/route.ts       — GET ?deleted=true, PATCH to restore
 *  - app/(app)/admin/assetTracking/assets/page.tsx — the active Assets list
 */

import { useAdminAccess } from '@/hooks/useAdminAccess'
import DynamicPage from '@/components/dynamicPage'
import type { dynamicPageConfig } from '@/components/dynamicPage'
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline'

// Format date consistent with the rest of the admin pages
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-MY', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Restore a single asset, then refresh the table so it disappears from
// this "Deleted Assets" list (WC)
const handleRestore = async (row: Record<string, unknown>, refresh: () => void) => {
  const assetId = row.asset_id as string
  if (!confirm(`Restore asset ${assetId}? It will reappear in the active Assets list.`)) return

  const res = await fetch(`/api/assets?asset_id=${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
  })

  if (res.ok) {
    refresh()
  } else {
    const error = await res.json().catch(() => ({}))
    alert(`Failed to restore asset: ${error?.error || 'Unknown error'}`)
  }
}

const deletedAssetsConfig: dynamicPageConfig = {
  entityName: 'deletedAsset',
  entityDisplayName: 'Deleted Assets',
  entityDisplayNameSingular: 'Asset',
  // Same endpoint as the active Assets page, but with ?deleted=true so
  // the GET handler flips its deleted_dt filter (WC)
  apiEndpoint: '/api/assets?deleted=true',
  primaryKey: 'asset_id',
  pageTitle: 'Deleted Assets',
  pageDescription: 'Assets that have been removed — restore one to bring it back',
  defaultSortBy: 'deleted_dt',
  showAddButton: false, // this page never creates assets
  showConditionFilter: true,

  // Only a Restore action here — no Edit/Delete on an already-deleted row (WC)
  customActions: [
    {
      label: 'Restore',
      icon: <ArrowUturnLeftIcon className="h-5 w-5" strokeWidth={2.5} />,
      className: 'inline-flex items-center justify-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors text-xs font-medium',
      show: () => true,
      onClick: handleRestore,
    },
  ],

  searchFields: [
    { key: 'asset_id', label: 'Search by Asset ID' },
    { key: 'name', label: 'Search by Asset Name' },
  ],

  columns: [
    {
      key: 'asset_id',
      label: 'Asset ID',
      sortable: true,
      render: (v) => <span className="font-medium text-gray-900">{String(v)}</span>,
    },
    { key: 'name', label: 'Asset Name', sortable: true },
    { key: 'model', label: 'Model', sortable: false },
    { key: 'category', label: 'Category', sortable: false },
    {
      key: 'condition',
      label: 'Condition',
      sortable: false,
      render: (v) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full
          ${v === 'In-use' ? 'bg-green-100 text-green-800'
          : v === 'In-store' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
          }`}>{String(v)}</span>
      ),
    },
    {
      key: 'deleted_dt',
      label: 'Deleted At',
      sortable: true,
      render: (v) => <span className="text-gray-500 whitespace-nowrap">{formatDate(v as string | null)}</span>,
    },
  ],

  formFields: [], // no add/edit form — this is a restore-only view
}

export default function DeletedAssetsPage() {
  const { isLoading, isAdmin } = useAdminAccess()

  if (isLoading || !isAdmin) return null

  return <DynamicPage config={deletedAssetsConfig} />
}