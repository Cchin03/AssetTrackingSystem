// app/(app)/admin/assetTracking/assets/page.tsx
'use client'

/** Commented by Desmond @ 21-April-26
 * @file assets/page.tsx
 * @description The asset listing page under the admin modules
 * This file
 *  - defines the config object (assetsConfig) that describes how the assets are displayed in the dynamicPage
 *    or data table
 *  - renders the BarcodeThumbnail component that shows saved barcode images from the Supabase bucket in the table
 *
 * LATEST CHANGES (WC)
 * --------------------
 *  - Delete now uses customActions to route to a dedicated confirmation
 *    page (delete/[id]/page.tsx) instead of DynamicPage's default
 *    window.confirm() delete, so staff can pick a structured reason.
 *  - Setting customActions replaces DynamicPage's default Edit/Delete pair
 *    entirely, so an "Edit" custom action is added here too, replicating
 *    the same router.push(`${editUrl}/${id}`) DynamicPage normally does.
 *
 * Related files include
 *  - components/dynamicPage.tsx
 *    The dynamic page to display the list of assets with the data table
 *
 *  - components/dynamicAdd.tsx
 *    The dynamic add form page
 *
 *  - app/api/assets/route.ts
 *    The API route for GET/POST/PUT/DELETE
 *
 *  - app/api/assets/[id]/route.ts
 *    Fetch/update a single asset by ID — used by Edit and the new Delete
 *    confirmation page
 *
 *  - app/(app)/admin/assetTracking/assets/delete/[id]/page.tsx
 *    New dedicated delete confirmation page with a reason field
 *
 *  - lib/barcode/barcode.ts
 *    Generate the barcode and saving it to the Supabase bucket storage
*/
import DynamicPage from '@/components/dynamicPage'
import type { dynamicPageConfig } from '@/components/dynamicPage'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import IdCodeModal from '@/components/ui/idCodeModal'
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline'

// ------------------ Storage URL helper --------------------
/** Commented by Desmond @ 21-April-26
 * @param tagPath - The storage path from the asset's tag_path DB column.
 *                  e.g. 'assets/ICT-LAPTOP-001.png'
 * @returns The full public URL string, or null if the path is missing or invalid
 */
function getStorageUrl(tagPath: string | null): string | null {
  if (!tagPath || typeof tagPath !== 'string' || tagPath.trim() === '') {
    return null
  }

  try {
    const { data } = supabase.storage.from('IdCodes').getPublicUrl(tagPath)

    if (!data?.publicUrl) {
      console.warn('Barcode thumbnail: Failed to get public URL for tagPath:', tagPath)
      return null
    }

    return data.publicUrl
  } catch (error) {
    console.error('Barcode thumbnail: Error getting storage URL', {
      tagPath,
      error: (error as Error).message
    })
    return null
  }
}

// ------------------ Render the barcode thumbnail -------------------
function BarcodeThumbnail({ tagPath, assetId, name, onOpen }
  : { tagPath: string | null, assetId: string, name?: string, onOpen: (tagPath: string, assetId: string, label?: string ) => void
}) {
  const url = getStorageUrl(tagPath)

  if (!url) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
        No barcode
      </span>
    )
  }

  return (
    <button type="button" onClick={() => onOpen(tagPath!, assetId, name)} title="Click to view, print or save barcode"
            className="inline-block rounded border border-gray-200 hover:border-red-400 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-500"
    >
      <Image src={url} alt={`Barcode - ${tagPath}`} width={96} height={40} className="object-contain" unoptimized
        onError={(_e) => {
          console.error('Image failed to load:', {tagPath, url})
        }}
      />
    </button>
  )
}

// -------------------------- Main page component --------------------------
export default function AssetsPage() {
  const { isLoading, isAdmin } = useAdminAccess()
  const router = useRouter()

  const [modal, setModal] = useState<{
    tagPath: string
    assetId: string
    label?: string
  } | null>(null)

  const openModal = (tagPath: string, assetId: string, label?: string) =>
    setModal({ tagPath, assetId, label })

  const closeModal = () => setModal(null)

  if (isLoading || !isAdmin) {
    return null
  }

  const assetsConfig: dynamicPageConfig = {
    entityName: 'asset',
    entityDisplayName: 'Asset',
    entityDisplayNameSingular: 'Asset',
    apiEndpoint: '/api/assets',
    primaryKey: 'asset_id',
    pageTitle: 'Assets',
    pageDescription: 'Manage and track the asset records',
    defaultSortBy: 'created_dt',
    showAddButton: true,
    showConditionFilter: true,
    addUrl: '/admin/assetTracking/addAsset',
    editUrl: '/admin/assetTracking/editAsset',
    searchFields: [
      { key: 'asset_id', label: 'Search by Asset ID' },
      { key: 'name', label: 'Search by Asset Name' }
    ],

    // Setting customActions replaces DynamicPage's default Edit/Delete
    // buttons entirely — so Edit is re-added here manually (same
    // navigation DynamicPage's own handleEdit would do), and Delete now
    // routes to the dedicated confirmation page instead of a plain
    // window.confirm() (WC)
    customActions: [
      {
        label: 'Edit',
        icon: <PencilIcon className="h-4 w-4" strokeWidth={2.5} />,
        className: 'inline-flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-xs font-medium',
        show: () => true,
        onClick: (row: Record<string, unknown>) => {
          router.push(`/admin/assetTracking/editAsset/${row.asset_id}`)
        },
      },
      {
        label: 'Delete',
        icon: <TrashIcon className="h-4 w-4" strokeWidth={2.5} />,
        className: 'inline-flex items-center justify-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors text-xs font-medium',
        show: () => true,
        onClick: (row: Record<string, unknown>) => {
          router.push(`/admin/assetTracking/assets/delete/${row.asset_id}`)
        },
      },
    ],

    columns: [
      {
        key: 'asset_id',
        label: 'Asset ID',
        sortable: true,
        render: (v: unknown) => <span className="font-medium text-gray-900">{String(v)}</span>
      },
      {
        key: 'tag_path',
        label: 'Barcode',
        sortable: false,
        render: (value: unknown, row: Record<string, unknown>) => (
          <BarcodeThumbnail
            tagPath={typeof value === 'string' ? value : null}
            assetId={String(row.asset_id ?? '')}
            name={typeof row.name === 'string' ? row.name : undefined}
            onOpen={openModal}
          />
        ),
      },
      { key: 'name', label: 'Asset Name', sortable: true },
      { key: 'model', label: 'Model', sortable: false },
      { key: 'category', label: 'Category', sortable: false },
      {
        key: 'condition', label: 'Condition', sortable: false,
        render: (v: unknown) => (
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full
            ${v === 'In-use' ? 'bg-green-100 text-green-800'
            : v === 'In-store' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
            }`}>{String(v)}</span>
        )
      },
      { key: 'location', label: 'Location', sortable: false,
        render: (_: unknown, row: Record<string, unknown>) => {
          const loc = row.location as { name?: string } | null
          return loc?.name ?? 'N/A'
        },
      },
      { key: 'department', label: 'Department', sortable: false,
        render: (_: unknown, row: Record<string, unknown>) => {
          const dept = row.department as { name?: string } | null
          return dept?.name ?? 'N/A'
        },
      },
      {
        key: 'created_dt',
        label: 'Created Date',
        sortable: true,
        render: (value: unknown) => new Date(String(value)).toLocaleDateString('en-GB', {
          day: '2-digit', month: '2-digit', year: 'numeric'
        })
      }
    ],

    formFields: [
      {
        key: 'asset_id',
        label: 'Asset ID',
        type: 'text' as const,
        disabled: false,
        required: true,
        placeholder: 'Enter asset barcode (e.g., ICT-LAPTOP-001)'
      },
      { key: 'name', label: 'Name', type: 'text' as const, required: true },
      { key: 'model', label: 'Model', type: 'text' as const, required: true },
      { key: 'description', label: 'Description', type: 'textarea' as const },
      { key: 'category', label: 'Category', type: 'text' as const, required: true },
      {
        key: 'condition',
        label: 'Condition',
        type: 'select' as const,
        options: [
          { value: 'In-use', label: 'In-use' },
          { value: 'In-store', label: 'In-store' },
          { value: 'Spoiled', label: 'Spoiled' }
        ]
      },
      { key: 'location_id', label: 'Location', type: 'select' as const },
      { key: 'department_id', label: 'Department', type: 'select' as const }
    ]
  }

  return (
    <>
      <DynamicPage config={assetsConfig} />

      {modal && (
        <IdCodeModal
          isOpen={true}
          onClose={closeModal}
          tagPath={modal.tagPath}
          entityType="asset"
          entityId={modal.assetId}
          entityLabel={modal.label}
        />
      )}
    </>
  )
}