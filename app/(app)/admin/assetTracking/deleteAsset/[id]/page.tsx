// app/(app)/admin/assetTracking/assets/delete/[id]/page.tsx
'use client'

/**
 * @file delete/[id]/page.tsx
 * @description Dedicated delete-confirmation page for a single asset.
 * Reached by clicking "Delete" on the Assets table (via dynamicPage.tsx's
 * deleteUrl routing) instead of a plain browser confirm()/prompt(). Lets
 * the admin pick a structured reason (or write their own) before the
 * asset is soft-deleted — that reason is stored in AuditLog.reason. (WC)
 *
 * Related files:
 *  - app/(app)/admin/assetTracking/assets/page.tsx — sets deleteUrl, which
 *    routes here as `${deleteUrl}/${asset_id}`
 *  - components/dynamicPage.tsx — deleteUrl routing logic
 *  - app/api/assets/route.ts — GET (fetch this one asset), DELETE (reads
 *    { reason } from the request body)
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import Breadcrumb from '@/components/ui/breadcrumb'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

// Predefined reasons — covers the common cases so most deletions don't need
// free typing. "Other" reveals a text box for anything not covered (WC)
const DELETE_REASONS = [
  'Broken beyond repair',
  'Lost',
  'Stolen',
  'Obsolete / replaced',
  'Duplicate entry',
  'Other',
] as const

interface AssetSummary {
  asset_id: string
  name: string
  model: string
  category: string
  condition: string
}

export default function DeleteAssetPage() {
  const { isLoading: isAuthLoading, isAdmin } = useAdminAccess()
  const router = useRouter()
  const params = useParams()
  const assetId = String(params.id)

  const [asset, setAsset] = useState<AssetSummary | null>(null)
  const [isLoadingAsset, setIsLoadingAsset] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedReason, setSelectedReason] = useState<string>('')
  const [customReason, setCustomReason] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Fetch the asset's basic info so the confirmation page shows what's
  // actually about to be deleted, not just a bare ID (WC)
  useEffect(() => {
    if (!assetId) return

    const fetchAsset = async () => {
      try {
        const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`)
        const json = await res.json()

        if (!res.ok || !json.success) {
          setLoadError(json?.error || 'Asset not found')
        } else {
          setAsset(json.data)
        }
      } catch {
        setLoadError('Failed to load asset details')
      } finally {
        setIsLoadingAsset(false)
      }
    }

    fetchAsset()
  }, [assetId])

  const breadcrumbItems = [
    { label: 'Home', href: '/admin/dashboard', isClickable: true },
    { label: 'Assets', href: '/admin/assetTracking/assets', isClickable: true },
    { label: 'Delete', href: '#', isClickable: false },
  ]

  const handleCancel = () => {
    router.push('/admin/assetTracking/assets')
  }

  const handleConfirmDelete = async () => {
    setSubmitError(null)

    if (!selectedReason) {
      setSubmitError('Please select a reason for deletion.')
      return
    }
    if (selectedReason === 'Other' && !customReason.trim()) {
      setSubmitError('Please describe the reason for deletion.')
      return
    }

    const finalReason = selectedReason === 'Other' ? customReason.trim() : selectedReason

    setIsDeleting(true)
    try {
      const url = new URL(`/api/assets`, window.location.origin)
      url.searchParams.set('asset_id', assetId)

      const res = await fetch(url.toString(), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason }),
      })

      if (res.ok) {
        router.push('/admin/assetTracking/assets')
      } else {
        const error = await res.json().catch(() => ({}))
        setSubmitError(error?.error || 'Failed to delete asset. Please try again.')
      }
    } catch {
      setSubmitError('Unexpected error. Please check your connection and try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  if (isAuthLoading || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased">
      <main className="p-6">
        <div className="max-w-2xl mx-auto">
          <Breadcrumb customItems={breadcrumbItems} />

          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-600 flex-shrink-0" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Delete Asset</h1>
                <p className="text-gray-500 text-sm mt-1">
                  This will remove the asset from the active list. It can be restored later
                  from the Deleted Assets page.
                </p>
              </div>
            </div>

            {isLoadingAsset ? (
              <div className="text-center py-8 text-gray-500">Loading asset details...</div>
            ) : loadError ? (
              <div className="text-center py-8 text-red-600">{loadError}</div>
            ) : asset ? (
              <>
                {/* Asset summary — what's actually about to be deleted */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Asset ID</span>
                      <p className="font-medium text-gray-900">{asset.asset_id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Name</span>
                      <p className="font-medium text-gray-900">{asset.name}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Model</span>
                      <p className="font-medium text-gray-900">{asset.model || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Category</span>
                      <p className="font-medium text-gray-900">{asset.category || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Reason selection */}
                <div className="mb-4">
                  <label className="text-sm font-semibold text-gray-700 block mb-2">
                    Reason for deletion <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedReason}
                    onChange={(e) => { setSelectedReason(e.target.value); setSubmitError(null) }}
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="">-- Select a reason --</option>
                    {DELETE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>{reason}</option>
                    ))}
                  </select>
                </div>

                {selectedReason === 'Other' && (
                  <div className="mb-4">
                    <label className="text-sm font-semibold text-gray-700 block mb-2">
                      Please describe <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={customReason}
                      onChange={(e) => { setCustomReason(e.target.value); setSubmitError(null) }}
                      rows={3}
                      placeholder="Describe why this asset is being deleted..."
                      className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                    />
                  </div>
                )}

                {submitError && (
                  <p className="text-sm text-red-600 mb-4">{submitError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition-colors font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isDeleting}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  )
}