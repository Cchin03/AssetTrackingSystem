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
 *  - app/api/assets/check/route.ts
 *    Checking for duplicate asset_id when creating new asset record and barcode
 * 
 *  - lib/barcode.ts
 *    Generate the barcode and saving it to the Supabase bucket storage
*/
import DynamicPage from '@/components/dynamicPage'
import type { dynamicPageConfig } from '@/components/dynamicPage'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { useState } from 'react'
import IdCodeModal from '@/components/ui/idCodeModal'

// ------------------ Storage URL helper --------------------
/** Commented by Desmond @ 21-April-26
 * @param tagPath - The storage path from the asset's tag_path DB column.
 *                  e.g. 'assets/ICT-LAPTOP-001.png'
 * @returns The full public URL string, or null if the path is missing or invalid
 */
function getStorageUrl(tagPath: string | null): string | null {
  // If url path for barcode/QR does not exist
  if (!tagPath || typeof tagPath !== 'string' || tagPath.trim() === '') {
    return null
  }

  try {
    // The bucket storing the id codes is named 'IdCodes'
    // Modify the bucket name is you are using a different naming
    const { data } = supabase.storage.from('IdCodes').getPublicUrl(tagPath)

    // Validate that a url is received back
    if (!data?.publicUrl) {
      console.warn('Barcode thumbnail: Failed to get public URL for tagPath:', tagPath)
      return null
    }

    // Return the image's public url from the bucket
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
/** Commented by Desmond @ 30-April-26
 * @param tagPath - The storage path from the asset's tag_path DB column.
 *                  e.g. 'assets/ICT-LAPTOP-001.png'
 * @param assetId - asset_id passed to the modal for the header label
 * @param name - Asset name shown as a label in the modal
 * @param onOpen - Callback to open the modal with the asset's details
 */
function BarcodeThumbnail({ tagPath, assetId, name, onOpen } 
  : { tagPath: string | null, assetId: string, name?: string, onOpen: (tagPath: string, assetId: string, label?: string ) => void
}) {
  // Store the image url in a variable
  const url = getStorageUrl(tagPath)

  if (!url) {
    // When a URL does not exist or an asset simply has no barcode
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
        No barcode
      </span>
    )
  }

  return (
    // Display the barcode image in the table
    // Clicking the image opens the full-size PNG in a new browser tab
    // rel="noopener noreferrer" prevents the opened tab to redirect back to the previous tab
    // <a href={url} target="_blank" rel="noopener noreferrer" title="Click to view full-sized barcode"
    //    className="inline-block rounded border border-gray-200 hover:border-red-400 transition-colors"
    // >

    <button type="button" onClick={() => onOpen(tagPath!, assetId, name)} title="Click to view, print or save barcode"
            className="inline-block rounded border border-gray-200 hover:border-red-400 transition-colors
                       focus:outline-none focus:ring-2 focus:ring-red-500"           
    >

      {/* The barcode image */}
      <Image src={url} alt={`Barcode - ${tagPath}`} width={96} height={40} className="object-contain" unoptimized 
        onError={(_e) => { // _e so that the compiler knows that the developer know this unused variable exists, but ignores it
          console.error('Image failed to load:', {tagPath, url})
        }}
      />
    </button>
  )
}

// -------------------------- Main page component --------------------------
// This is a thin wrapper that passes the config to dynamicPage
// All table rendering, search, sort, pagination and actions are live in dynamicPage
export default function AssetsPage() {
  // Block non-admins from accessing this page on the client side
  const { isLoading, isAdmin } = useAdminAccess()

  // Modal state — opened when the user clicks a barcode thumbnail
  const [modal, setModal] = useState<{
    tagPath: string
    assetId: string
    label?: string
  } | null>(null)

  const openModal = (tagPath: string, assetId: string, label?: string) =>
    setModal({ tagPath, assetId, label })

  const closeModal = () => setModal(null)

  // Show nothing while checking session, or if user is not admin (hook will redirect them)
  if (isLoading || !isAdmin) {
    return null
  }

  // ------------------ Page config to be fed into the dynamic page -------------------
const assetsConfig: dynamicPageConfig = {
  entityName: 'asset',
  entityDisplayName: 'Asset',
  entityDisplayNameSingular: 'Asset',
  // api endpoint for assets
  apiEndpoint: '/api/assets',
  // Primary key of the Asset table
  primaryKey: 'asset_id',
  pageTitle: 'Assets',
  pageDescription: 'Manage and track the asset records',
  defaultSortBy: 'created_dt',
  showAddButton: true,
  showConditionFilter: true,
  addUrl: '/admin/assetTracking/addAsset',
  editUrl: '/admin/assetTracking/editAsset',
  searchFields: [
    { key: 'asset_id', label: 'Search by Asset ID' },  // First field - will be left search box
    { key: 'name', label: 'Search by Asset Name' }     // Second field - will be right search box
  ],
  // ------------------------ Table columns ------------------------
  columns: [
    // ------------------- asset_id (PK) --------------------
    {
      key: 'asset_id',
      label: 'Asset ID',
      sortable: true,
      // Render the component here
      render: (v: unknown) => <span className="font-medium text-gray-900">{String(v)}</span>
    },

    // --------------- tag_path (URL for barcode) ------------
    {
      key: 'tag_path',
      label: 'Barcode',
      sortable: false,
      // Render the barcode image here
      render: (value: unknown, row: Record<string, unknown>) => (
        <BarcodeThumbnail
          tagPath={typeof value === 'string' ? value : null}
          assetId={String(row.asset_id ?? '')}
          name={typeof row.name === 'string' ? row.name : undefined}
          onOpen={openModal} 
        />
      ),
    },

    // ------------------- name --------------------
    { 
      key: 'name', 
      label: 'Asset Name', 
      sortable: true 
    },

    // ------------------ model -------------------
    { 
      key: 'model', 
      label: 'Model', 
      sortable: false 
    },

    // --------------- category ------------------
    { 
      key: 'category', 
      label: 'Category', 
      sortable: false 
    },

    // -------------- condition ------------------
    {
      key: 'condition', label: 'Condition', sortable: false,
      render: (v: unknown) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full 
          ${v === 'In-use' ? 'bg-green-100 text-green-800' 
          : v === 'In-store' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
          }`}>{String(v)}</span>
      )
    },

    // -------------- location (FK) --------------
    { key: 'location', label: 'Location', sortable: false, 
      render: (_: unknown, row: Record<string, unknown>) => {
        const loc = row.location as { name?: string } | null
        return loc?.name ?? 'N/A'
      },
    },

    // ------------- department (FK) --------------
    { key: 'department', label: 'Department', sortable: false, 
      render: (_: unknown, row: Record<string, unknown>) => {
        const dept = row.department as { name?: string } | null
        return dept?.name ?? 'N/A'
      },
    },

    // --------------- created_dt -----------------
    {
      key: 'created_dt',
      label: 'Created Date',
      sortable: true,
      render: (value: unknown) => new Date(String(value)).toLocaleDateString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      })
    }
  ],

  // ------------------------- Form fields -----------------------------
  // These describes the inputs shown in the Add/Edit form page
  // The add form is rendered by dynamicAdd, the edit form by dynamicEdit
  formFields: [
    // -------------- asset_id (PK) --------------
    {
      key: 'asset_id',
      label: 'Asset ID',
      type: 'text' as const,
      disabled: false,
      required: true,
      placeholder: 'Enter asset barcode (e.g., ICT-LAPTOP-001)'
    },

    // ---------------- name ------------------
    { 
      key: 'name', 
      label: 'Name', 
      type: 'text' as const, 
      required: true 
    },

    // --------------- model ------------------
    { 
      key: 'model', 
      label: 'Model', 
      type: 'text' as const, 
      required: true 
    },
    
    // ------------- description --------------
    { 
      key: 'description', 
      label: 'Description', 
      type: 'textarea' as const 
    },

    // -------------- category ---------------
    { 
      key: 'category', 
      label: 'Category', 
      type: 'text' as const, 
      required: true 
    },

    // ------------- condition ---------------
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

    // ----------- location_id (FK) --------------
    { 
      key: 'location_id', 
      label: 'Location', 
      type: 'select' as const 
    },
    
    // ---------- department_id (FK) -------------
    { 
      key: 'department_id', 
      label: 'Department', 
      type: 'select' as const 
    }
  ]
}

  return (
  <>
    <DynamicPage config={assetsConfig} />

    {/* Barcode modal — opens when user clicks a barcode thumbnail */}
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