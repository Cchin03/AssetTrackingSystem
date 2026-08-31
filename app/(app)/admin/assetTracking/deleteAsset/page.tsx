// app/(app)/admin/assetTracking/assets/delete/[id]/page.tsx
'use client'

/**
 * @file delete/[id]/page.tsx
 * @description Dedicated delete confirmation page for a single asset.
 * Replaces the generic window.confirm() delete flow (still used by other
 * DynamicPage-managed entities) with a full page that shows the asset's
 * details and collects a structured reason before soft-deleting it.
 *
 * Related files:
 *  - app/api/assets/[id]/route.ts  — GET asset details
 *  - app/api/assets/route.ts       — DELETE (reads { reason } from body)
 *  - app/(app)/admin/assetTracking/assets/page.tsx — links here instead
 *    of using DynamicPage's default delete button (WC)
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { ExclamationTriangleIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'

const REASON_OPTIONS = [
  'Broken beyond repair',
  'Lost',
  'Stolen',
  'Duplicate entry',
  'Obsolete / no longer needed',
  'Other',
] as const

interface AssetDetails {
  asset_id: string
  name: string
  model: string
  category: string
  condition: string
  location?: { name?: string } | null
  department?: { name?: string } | null
}

export default function DeleteAssetPage() {
  const { isLoading: isAuthLoading, isAdmin } = useAdminAccess()
  const params = useParams()
  const router = useRouter()
  const assetId = String(params.id)

  const [asset, setAsset] = useState<AssetDetails | null>(null)
  const [isLoadingAsset, setIsLoadingAsset] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [selectedReason, setSelectedReason] = useState<string>('')
  const [detailText, setDetailText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    if (isAuthLoading || !isAdmin) return

    const fetchAsset = async () => {
      try {
        const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}`)
        const json = await res.json()
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Asset not found')
        }
        setAsset(json.data)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load asset')
      } finally {
        setIsLoadingAsset(false)
      }
    }

    fetchAsset()
  }, [assetId, isAuthLoading, isAdmin])

  if (isAuthLoading || !isAdmin) return null

  const isOtherSelected = selectedReason === 'Other'
  const canSubmit = selectedReason !== '' && (!isOtherSelected || detailText.trim().length > 0)

  const handleDelete = async () => {
    if (!canSubmit) return
    setIsDeleting(true)
    setSubmitError(null)

    // Combine the dropdown choice with any extra detail typed in, e.g.
    // "Broken beyond repair - Chair leg snapped, unsafe to sit on" (WC)
    const reason = isOtherSelected
      ? detailText.trim()
      : detailText.trim()
        ? `${selectedReason} - ${detailText.trim()}`
        : selectedReason

    try {
      const res = await fetch(`/api/assets?asset_id=${encodeURIComponent(assetId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to delete asset')
      }

      router.push('/admin/assetTracking/assets')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to delete asset')
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased">
      <main className="p-6">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => router.push('/admin/assetTracking/assets')}
            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Assets
          </button>

          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            <div className="flex items-start gap-3 mb-6">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <ExclamationTriangleIcon className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Delete Asset</h1>
                <p className="text-sm text-gray-500">This asset will be removed from active listings. It can be restored later from Deleted Assets.</p>
              </div>
            </div>

            {isLoadingAsset ? (
              <div className="text-center py-8 text-gray-500">Loading asset details...</div>
            ) : loadError ? (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">{loadError}</div>
            ) : asset ? (
              <>
                {/* Asset summary */}
                <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-6 space-y-1 text-sm">
                  <div><span className="font-semibold text-gray-700">Asset ID:</span> {asset.asset_id}</div>
                  <div><span className="font-semibold text-gray-700">Name:</span> {asset.name}</div>
                  <div><span className="font-semibold text-gray-700">Model:</span> {asset.model}</div>
                  <div><span className="font-semibold text-gray-700">Category:</span> {asset.category}</div>
                  <div><span className="font-semibold text-gray-700">Condition:</span> {asset.condition}</div>
                  <div><span className="font-semibold text-gray-700">Location:</span> {asset.location?.name ?? 'N/A'}</div>
                  <div><span className="font-semibold text-gray-700">Department:</span> {asset.department?.name ?? 'N/A'}</div>
                </div>

                {/* Reason dropdown */}
                <div className="mb-4">
                  <label className="text-sm font-semibold text-gray-700 block mb-2">
                    Reason for deletion <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  >
                    <option value="" disabled>Select a reason...</option>
                    {REASON_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                {/* Detail text box */}
                <div className="mb-6">
                  <label className="text-sm font-semibold text-gray-700 block mb-2">
                    Additional details {isOtherSelected && <span className="text-red-500">*</span>}
                    {!isOtherSelected && <span className="text-gray-400 font-normal"> (optional)</span>}
                  </label>
                  <textarea
                    value={detailText}
                    onChange={(e) => setDetailText(e.target.value)}
                    rows={3}
                    placeholder={isOtherSelected ? 'Please describe the reason...' : 'Any extra context (optional)...'}
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                  />
                </div>

                {submitError && (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3 mb-4">{submitError}</div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => router.push('/admin/assetTracking/assets')}
                    className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={!canSubmit || isDeleting}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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