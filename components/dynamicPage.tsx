// components/dynamicPage.tsx
'use client'

/**
 * @file dynamicPage.tsx
 * @description A reusable dynamic page component that contains a data table for the admin module.
 *
 * This single component handles record listing, searching, sorting, pagination,
 * deleting, exporting, tabs, modals, and custom row actions — all driven by the
 * config object passed to it (assets, locations, departments, maintenance, etc.)
 *
 * Responsibilities
 *   1. Auth guard        — render nothing until admin session is confirmed
 *   2. Data loading      — fetch paginated data from the configured API endpoint
 *   3. Search + filter   — passes search, condition, and tab filter params to the API
 *   4. Sort              — sort by column, ascending or descending
 *   5. Delete            — ask for confirmation then performs a DELETE request
 *   6. Export PDF        — fetches all records in chunks, generates PDF via jsPDF
 *   7. Export CSV        — fetches all records in chunks, generates a CSV file
 *   8. Tabs              — optional status tabs above the DataTable (e.g. Pending / Approved)
 *   9. Modal             — optional row-detail modal managed internally
 *  10. Custom actions    — optional per-row action buttons replacing Edit/Delete
 *
 * Props
 *   - config — describes the entity: columns, API endpoint, URLs, tabs, modal, etc.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAdminAccess } from '@/hooks/useAdminAccess'
import { useRouter } from 'next/navigation'
import Breadcrumb from '@/components/ui/breadcrumb'
import DataTable from '@/components/ui/dataTable'

// ─────────────────────────── Types ───────────────────────────

/** A single row returned from the API — field values are unknown until runtime */
type EntityRow = Record<string, unknown>

interface FormFieldConfig {
  /** Database column name — used as the key in formData and the PUT body */
  key: string
  /** Human-readable label shown above the input */
  label: string
  /** Determines which HTML element is rendered for this field */
  type: 'text' | 'textarea' | 'select' | 'number'
  /** Whether the field is required */
  required?: boolean
  /** Whether the field is read-only */
  disabled?: boolean
  /** Static options for a select field */
  options?: { value: string; label: string }[]
  /** Placeholder text shown when the input is empty */
  placeholder?: string
}

/** One entry per tab, e.g. Pending / Approved / Rejected */
export interface TabConfig {
  /** Value sent to the API as a query param, e.g. 'pending' */
  key: string
  /** Display label shown on the tab button */
  label: string
  /** Optional icon rendered beside the label */
  icon?: React.ReactNode
  /** Key inside tabCounts returned by the API, used to show a badge count */
  badgeKey?: string
  /** Tailwind classes for the active state, e.g. 'border-yellow-600 text-yellow-600' */
  activeColor?: string
}

/** Custom row action — used instead of Edit/Delete when customActions is provided */
export interface CustomAction {
  label: string
  icon?: React.ReactNode
  className: string
  onClick: (row: EntityRow, refresh: () => void) => void
  /** Return false to hide this action for a given row / active tab */
  show?: (row: EntityRow, activeTab?: string) => boolean
  /** Return true to disable this action for a given row */
  disabled?: (row: EntityRow) => boolean
}

/** Modal config — DynamicPage manages selectedRow state internally */
export interface ModalConfig {
  renderModal: (row: EntityRow, onClose: () => void) => React.ReactNode
}

/** Configuration object passed to DynamicPage from each entity page */
export interface dynamicPageConfig {
  /** Short internal name for logging, e.g. 'asset' */
  entityName: string
  /** Plural display name, e.g. 'Assets' */
  entityDisplayName: string
  /** Singular display name, e.g. 'Asset' */
  entityDisplayNameSingular: string
  /** Base API endpoint, e.g. '/api/assets' */
  apiEndpoint: string
  /** Primary key field name, e.g. 'asset_id' */
  primaryKey: string

  /** Table column definitions */
  columns: {
    key: string
    label: string
    sortable?: boolean
    render?: (value: unknown, row: EntityRow, rowIndex?: number) => React.ReactNode
  }[]

  /** Ordered list of form fields (used by dynamicEdit page — not rendered here) */
  formFields: FormFieldConfig[]

  /** Show an Add button that redirects to the add form page */
  showAddButton?: boolean
  /** Show the condition filter dropdown (e.g. 'In-use', 'Damaged') */
  showConditionFilter?: boolean
  /** Search field options shown above the table */
  searchFields: { key: string; label: string }[]
  /** Default column to sort by */
  defaultSortBy: string
  /** Default sort order */
  defaultSortOrder?: 'asc' | 'desc' 
  /** Page heading */
  pageTitle: string
  /** Subheading / description */
  pageDescription: string
  /** URL for the Add page — optional for pages without an Add flow */
  addUrl?: string
  /** URL for the Edit page (primary key will be appended) — optional */
  editUrl?: string
  /**
   * URL for a dedicated Delete confirmation page (primary key will be
   * appended) — optional. When set, clicking Delete navigates there
   * instead of the built-in confirm()/prompt() flow, so pages that need
   * a structured deletion reason (e.g. Assets) can collect it on their
   * own page rather than a browser prompt (WC)
   */
  deleteUrl?: string

  // ── Optional extensions for maintenance-style pages ──────────────────────

  /** Renders status tabs above the DataTable when provided */
  tabsConfig?: TabConfig[]
  /** Query param name sent to the API for the active tab (default: 'status') */
  tabQueryParam?: string
  /** Replaces the default Edit/Delete buttons with custom per-row actions */
  customActions?: CustomAction[]
  /** Renders a detail modal when a row is selected */
  modalConfig?: ModalConfig
}

interface DynamicPageProps {
  config: dynamicPageConfig
}

// ─────────────────────── Helpers ─────────────────────────────

/**
 * Fetches ALL records from a paginated API endpoint in chunks of 100.
 * Respects the server-side Zod limit of 100 records per request.
 * Used by both PDF and CSV export handlers.
 */
async function fetchAllRecords(
  apiEndpoint: string,
  baseParams: Record<string, string>
): Promise<EntityRow[]> {
  const allData: EntityRow[] = []
  const API_LIMIT = 100
  let page = 1
  let hasMore = true

  while (hasMore) {
    // Build against the origin so relative apiEndpoint values work, then merge
    // params onto whatever query string apiEndpoint already has (e.g. Deleted
    // Assets uses '/api/assets?deleted=true') instead of concatenating a
    // second '?', which corrupts both the existing and new params (WC)
    const url = new URL(
      apiEndpoint,
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
    )
    url.searchParams.set('page', page.toString())
    url.searchParams.set('limit', API_LIMIT.toString())
    Object.entries(baseParams).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })

    const res = await fetch(url.toString())

    if (!res.ok) {
      throw new Error(
        `API returned ${res.status}: ${res.statusText}. ` +
        `This may indicate a validation error in query parameters.`
      )
    }

    const responseData = await res.json()

    if (!Array.isArray(responseData.data)) {
      throw new Error(
        `Invalid response format: expected data array, got ${typeof responseData.data}`
      )
    }

    if (typeof responseData.totalItems !== 'number') {
      throw new Error('Invalid response format: totalItems must be a number')
    }

    allData.push(...responseData.data)

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        `[fetchAllRecords] Page ${page}: fetched ${responseData.data.length} records` +
        ` (total: ${allData.length}/${responseData.totalItems})`
      )
    }

    hasMore = allData.length < responseData.totalItems
    page++
  }

  return allData
}

// ─────────────────────── Component ───────────────────────────

/** @param config — Describes the entity's columns, API, URLs, tabs, modal, and display names */
export default function DynamicPage({ config }: DynamicPageProps) {
  // Auth guard — wraps useSession with an admin role check
  const { session, isLoading: sessionLoading } = useAdminAccess()
  const router = useRouter()

  // Current page's records
  const [data, setData] = useState<EntityRow[]>([])
  // True while a data fetch is in flight
  const [loading, setLoading] = useState(true)
  // Gate all fetches and localStorage until mounted (prevents SSR/hydration mismatch)
  const [mounted, setMounted] = useState(false)

  // Search
  const [searchTerm, setSearchTerm] = useState('')
  const [searchField, setSearchField] = useState(config.searchFields[0]?.key ?? 'name')

  // Condition filter (e.g. 'In-use', 'Damaged') — only shown when showConditionFilter is true
  const [conditionFilter, setConditionFilter] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [recordsPerPage, setRecordsPerPage] = useState(10)
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  // Sort
  const [sortBy, setSortBy] = useState(config.defaultSortBy)
  const [sortOrder, setSortOrder] = useState(config.defaultSortOrder ?? 'desc')

  // Tab state — only meaningful when tabsConfig is provided
  const [activeTab, setActiveTab] = useState(config.tabsConfig?.[0]?.key ?? '')
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({})

  // Modal state — only meaningful when modalConfig is provided
  const [selectedRow, setSelectedRow] = useState<EntityRow | null>(null)

  // ── Lifecycle ────────────────────────────────────────────────

  useEffect(() => setMounted(true), [])

  // Reload data whenever any search / sort / pagination / filter / tab state changes
  useEffect(() => {
    if (mounted && session) {
      loadData()
    }
  }, [mounted, session, currentPage, recordsPerPage, sortBy, sortOrder, conditionFilter, searchTerm, activeTab])

  // ── Data loading ─────────────────────────────────────────────

  /** Fetches one page of records from the API with all active filters applied */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Build against the origin, then merge params onto whatever query
      // string config.apiEndpoint already has (e.g. Deleted Assets uses
      // '/api/assets?deleted=true') instead of concatenating a second '?',
      // which corrupts both the existing and new params (WC)
      const url = new URL(
        config.apiEndpoint,
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      )
      const params = {
        page: currentPage.toString(),
        limit: recordsPerPage.toString(),
        sortBy,
        sortOrder,
        ...(searchTerm && { search: searchTerm, searchField }),
        ...(conditionFilter && { condition: conditionFilter }),
        // Include the active tab as a query param when tabs are configured
        ...(config.tabsConfig && activeTab && {
          [config.tabQueryParam ?? 'status']: activeTab,
        }),
      }
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value)
      })

      const res = await fetch(url.toString())

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const responseData = await res.json()
      // Support both { data } (standard) and { assessments } (tab-style) response shapes
      setData(responseData.data ?? responseData.assessments ?? [])
      setTotalItems(responseData.totalItems ?? 0)
      setTotalPages(responseData.totalPages ?? 0)
      // Populate tab badge counts if the API returns them
      if (responseData.tabCounts) setTabCounts(responseData.tabCounts)
    } catch {
      alert(`Failed to load ${config.entityDisplayName.toLowerCase()}`)
    } finally {
      setLoading(false)
    }
  }, [
    currentPage, recordsPerPage, sortBy, sortOrder,
    searchTerm, searchField, conditionFilter, activeTab,
    config.apiEndpoint, config.entityDisplayName,
    config.tabsConfig, config.tabQueryParam,
  ])

  // ── Search & filter handlers ─────────────────────────────────

  /** Reset to page 1 and trigger a fresh search */
  const handleSearch = useCallback(() => {
    setCurrentPage(1)
    loadData()
  }, [loadData])

  /** Clear all search / filter / sort state back to defaults */
  const handleReset = useCallback(() => {
    setSearchTerm('')
    setSearchField(config.searchFields[0]?.key ?? 'name')
    setConditionFilter('')
    setCurrentPage(1)
    setSortBy(config.defaultSortBy)
    setSortOrder('desc')
    // Reset the active tab back to the first tab when tabs are configured
    if (config.tabsConfig?.[0]) setActiveTab(config.tabsConfig[0].key)
  }, [config.searchFields, config.defaultSortBy, config.tabsConfig])

  // ── Sort handler ─────────────────────────────────────────────

  /** Toggle asc/desc on the same column; switch column and reset to asc otherwise */
  const handleSort = useCallback((col: string) => {
    if (sortBy === col) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(col)
      setSortOrder('asc')
    }
  }, [sortBy])

  // ── Navigation handlers ──────────────────────────────────────

  /** Route to the Add page (only called when addUrl is defined) */
  const handleAdd = useCallback(() => {
    if (config.addUrl) router.push(config.addUrl)
  }, [config.addUrl, router])

  /** Route to the Edit page for the given row (only called when editUrl is defined) */
  const handleEdit = useCallback((item: EntityRow) => {
    if (config.editUrl) router.push(`${config.editUrl}/${item[config.primaryKey]}`)
  }, [config.editUrl, config.primaryKey, router])

  // ── Delete handler ───────────────────────────────────────────

  /** Show a confirmation dialog then send a DELETE request for the given row —
   *  or, when config.deleteUrl is set, navigate to a dedicated delete page
   *  instead (used by Assets, which collects a structured deletion reason
   *  on its own page rather than a browser prompt) (WC) */
  const handleDeleteRequest = useCallback(async (item: EntityRow) => {
    const itemId = String(item[config.primaryKey])

    if (config.deleteUrl) {
      router.push(`${config.deleteUrl}/${itemId}`)
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${config.entityDisplayNameSingular.toLowerCase()} with ID: ${itemId}?\n\nThis action cannot be undone.`
    )

    if (!confirmed) return

    try {
      const url = new URL(
        config.apiEndpoint,
        typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
      )
      url.searchParams.set(config.primaryKey, itemId)

      const res = await fetch(url.toString(), { method: 'DELETE' })

      if (res.ok) {
        setCurrentPage(1)
        loadData()
      } else {
        const error = await res.json().catch(() => ({}))
        throw new Error(`API returned ${res.status}: ${JSON.stringify(error)}`)
      }
    } catch (error) {
      console.error('[handleDeleteRequest] Error deleting:', error)
      alert(`Failed to delete ${config.entityDisplayNameSingular.toLowerCase()}`)
    }
  }, [config.apiEndpoint, config.primaryKey, config.entityDisplayNameSingular, config.deleteUrl, loadData, router])

  // ── Export handlers ──────────────────────────────────────────

  /** Fetch all records (paginated) and generate a PDF report via jsPDF */
  const handleExportPDF = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      const allData = await fetchAllRecords(config.apiEndpoint, {
        sortBy,
        sortOrder,
        ...(searchTerm && { search: searchTerm, searchField }),
        ...(conditionFilter && { condition: conditionFilter }),
        // Include the active tab filter so exports match what the user sees
        ...(config.tabsConfig && activeTab && {
          [config.tabQueryParam ?? 'status']: activeTab,
        }),
      })

      if (allData.length === 0) {
        alert('No data to export')
        return
      }

      // Dynamic imports — only download jsPDF when the user actually exports
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

      // Report header
      doc.setFontSize(18)
      doc.text('Asset Tracking System', 14, 20)
      doc.setFontSize(14)
      doc.text(`${config.entityDisplayName} Report`, 14, 30)

      let yPosition = 40
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPosition)
      yPosition += 6
      doc.text(`Total ${config.entityDisplayName}: ${allData.length}`, 14, yPosition)
      yPosition += 6

      if (searchTerm) {
        doc.text(`Search Filter: ${searchField} = "${searchTerm}"`, 14, yPosition)
        yPosition += 6
      }
      if (conditionFilter) {
        doc.text(`Condition Filter: ${conditionFilter}`, 14, yPosition)
        yPosition += 6
      }
      if (config.tabsConfig && activeTab) {
        doc.text(`Tab Filter: ${activeTab}`, 14, yPosition)
        yPosition += 6
      }

      autoTable(doc, {
        startY: yPosition + 5,
        head: [config.columns.map(col => col.label)],
        body: allData.map(item =>
          config.columns.map(col => {
            if (col.render) {
              const rendered = col.render(item[col.key], item)
              return typeof rendered === 'string' ? rendered : String(item[col.key] || '')
            }
            return String(item[col.key] || '')
          })
        ),
        theme: 'grid',
        headStyles: { fillColor: [220, 38, 38], textColor: 255, fontSize: 10, fontStyle: 'bold', halign: 'left' },
        styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      })

      doc.save(`${config.entityName}-report-${new Date().toISOString().slice(0, 10)}.pdf`)
      console.log('[handleExportPDF] PDF generated successfully')
    } catch (error) {
      console.error('[handleExportPDF] PDF generation failed:', error)
      alert(`Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [config, sortBy, sortOrder, searchTerm, searchField, conditionFilter, activeTab])

  /** Fetch all records (paginated) and download as a CSV file */
  const handleExportCSV = useCallback(async () => {
    try {
      const allData = await fetchAllRecords(config.apiEndpoint, {
        sortBy,
        sortOrder,
        ...(searchTerm && { search: searchTerm, searchField }),
        ...(conditionFilter && { condition: conditionFilter }),
        // Include the active tab filter so exports match what the user sees
        ...(config.tabsConfig && activeTab && {
          [config.tabQueryParam ?? 'status']: activeTab,
        }),
      })

      if (allData.length === 0) {
        alert('No data to export')
        return
      }

      const headers = ['No.', ...config.columns.map(col => col.label)]
      const rows = allData.map((item, index) => {
        const row: string[] = [(index + 1).toString()]
        config.columns.forEach(col => {
          if (col.render) {
            const rendered = col.render(item[col.key], item)
            const value = typeof rendered === 'string' ? rendered : String(item[col.key] || 'N/A')
            row.push(`"${value.replace(/"/g, '""')}"`) // Escape internal quotes
          } else {
            const value = String(item[col.key] ?? 'N/A')
            row.push(`"${value.replace(/"/g, '""')}"`)
          }
        })
        return row
      })

      const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${config.entityName}-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('[handleExportCSV] Error:', error)
      alert(`Failed to export CSV: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [config, sortBy, sortOrder, searchTerm, searchField, conditionFilter, activeTab])

  // ── Auth / loading guard ─────────────────────────────────────

  if (!mounted || sessionLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white">
      <main className="p-6">
        <div className="w-full mx-auto">
          <Breadcrumb />

          {/* Page heading */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">{config.pageTitle}</h1>
            <p className="text-gray-600 mt-1">{config.pageDescription}</p>
          </div>

          {/* Status tabs — rendered above DataTable only when tabsConfig is provided */}
          {config.tabsConfig && (
            <div className="mb-4">
              <div className="flex gap-2 border-b border-gray-200">
                {config.tabsConfig.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setCurrentPage(1) }}
                    className={`px-4 py-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                      activeTab === tab.key
                        ? `border-b-2 ${tab.activeColor ?? 'border-red-600 text-red-600'}`
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {tab.badgeKey !== undefined && (
                      <span className="ml-1">({tabCounts[tab.badgeKey!] ?? 0})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DataTable
            title={`${config.entityDisplayName} Listing`}
            columns={
              // When customActions has actual entries, inject a custom Actions column.
              // An empty array (used by read-only pages like the audit log to suppress
              // Edit/Delete entirely) falls through to the plain config.columns branch
              // instead of leaving a blank "Actions" header with no buttons in it.
              config.customActions && config.customActions.length > 0
                ? [
                    // If a modalConfig is also provided, wrap the asset_id cell so
                    // clicking the thumbnail opens the modal
                    ...config.columns.map(col =>
                      col.key === 'asset_id' && config.modalConfig
                        ? {
                            ...col,
                            render: (v: unknown, row: EntityRow) => {
                              const original = col.render?.(v, row)
                              if (!row.image_url || !original) return original
                              return (
                                <div
                                  onClick={() => setSelectedRow(row)}
                                  style={{ cursor: 'pointer' }}
                                  title="Click image to enlarge"
                                >
                                  {original}
                                </div>
                              )
                            },
                          }
                        : col
                    ),
                    {
                      key: '__actions__',
                      label: 'Actions',
                      sortable: false,
                      render: (_: unknown, row: EntityRow) => {
                        const visibleActions = config.customActions!.filter(
                          action => !action.show || action.show(row, activeTab)
                        )
                        // View / Approve / Reject are rendered as compact icon buttons
                        const viewAction    = visibleActions.find(a => a.label === 'View')
                        const approveAction = visibleActions.find(a => a.label === 'Approve')
                        const rejectAction  = visibleActions.find(a => a.label === 'Reject')
                        // Everything else (e.g. Reopen) is rendered as a labelled button below
                        const otherActions  = visibleActions.filter(
                          a => !['View', 'Approve', 'Reject'].includes(a.label)
                        )

                        return (
                          <div className="flex flex-col gap-1 items-start">
                            <div className="flex flex-row gap-1">
                              {viewAction && (
                                <button
                                  title="View"
                                  onClick={() => {
                                    if (config.modalConfig) setSelectedRow(row)
                                    else viewAction.onClick(row, loadData)
                                  }}
                                  disabled={viewAction.disabled?.(row)}
                                  className={viewAction.className}
                                >
                                  {viewAction.icon}
                                </button>
                              )}
                              {approveAction && (
                                <button
                                  title="Approve"
                                  onClick={() => approveAction.onClick(row, loadData)}
                                  disabled={approveAction.disabled?.(row)}
                                  className={approveAction.className}
                                >
                                  {approveAction.icon}
                                </button>
                              )}
                              {rejectAction && (
                                <button
                                  title="Reject"
                                  onClick={() => rejectAction.onClick(row, loadData)}
                                  disabled={rejectAction.disabled?.(row)}
                                  className={rejectAction.className}
                                >
                                  {rejectAction.icon}
                                </button>
                              )}
                            </div>
                            {/* Reopen and any other actions are rendered below the icon row */}
                            {otherActions.map(action => (
                              <button
                                key={action.label}
                                title={action.label}
                                onClick={() => action.onClick(row, loadData)}
                                disabled={action.disabled?.(row)}
                                className={action.className}
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        )
                      },
                    },
                  ]
                : config.columns // Standard behaviour for asset / location / department pages
            }
            data={data}
            loading={loading}
            searchTerm={searchTerm}
            searchField={searchField}
            searchFields={config.searchFields}
            onSearchFieldChange={setSearchField}
            onSearchChange={setSearchTerm}
            onSearch={handleSearch}
            onReset={handleReset}
            onExportPDF={handleExportPDF}
            onExportCSV={handleExportCSV}
            showConditionFilter={config.showConditionFilter}
            conditionFilter={conditionFilter}
            onConditionFilterChange={setConditionFilter}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            recordsPerPage={recordsPerPage}
            onPageChange={setCurrentPage}
            onRecordsPerPageChange={setRecordsPerPage}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            // Skip default Edit/Delete when customActions is configured
            actions={!config.customActions ? { onEdit: handleEdit, onDelete: handleDeleteRequest } : undefined}
            showAddButton={config.showAddButton}
            onAdd={handleAdd}
          />
        </div>
      </main>

      {/* Detail modal — rendered only when modalConfig is provided and a row is selected */}
      {config.modalConfig && selectedRow && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedRow(null)}
        >
          <div onClick={e => e.stopPropagation()}>
            {config.modalConfig.renderModal(selectedRow, () => setSelectedRow(null))}
          </div>
        </div>
      )}
    </div>
  )
}