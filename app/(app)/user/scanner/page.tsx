'use client';

/** Commented by Desmond @ 30-April-26
 * @file app/(app)/user/scanner/page.tsx
 * @description Main scanner page for staff users.
 * 
 * QR scan link redirection support:
 * When a staff member scans a location or department QR sticker with their phone camera, the /scan/*
 * redirect routes sends them here with query params, such as 
 *    /user/scanner?type=location&scanLocation=G001
 *    /user/scanner?type=department&scanDepartment=IT
 * 
 * On mount, this page reads those params and immediately pre-sets the parentScan context, so the user
 * lands directly in the "scan assets to tag" mode without having to press any
 * buttons.
 * 
 * The resolved entity name like "Room G-001" is fetched from the API so the UI
 * will show a label and not just the raw ID, but this is subject to change.
 * 
 * Normal navigation:
 * When navigating from the dashboard (no query params), the page starts in normal
 * mode - the user chooses a scan type from the welcome screen.
 * 
 * Related files:
 *    - app/scan/location/[id]/route.ts: Redirects here with scanLocation param
 *    - app/scan/department/[id]/route.ts: Redirects here with scanDepartment param
 *    - components/scanner/welcomeContext.tsx
 *    - components/scanner/scannerContext.tsx
 *    - components/scanner/confirmationContext.tsx
 *    - components/scanner/successContext.tsx
 */

// useAuth - ensures only logged-in users can access this page, redirects others to /login
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import ScannerContent from '@/components/scanner/scannerContext'
import SuccessContent from '@/components/scanner/successContent'
import ConfirmationContent from '@/components/scanner/confirmationContext'
import { Package, Users, MapPin, Building2, CheckCircle, AlertCircle, ShoppingCart, Trash2, X } from 'lucide-react'

// ----------------------------------------------------------------------
//                                Types
// ----------------------------------------------------------------------
// Setting the parent scan context when redirected from a QR code scan
// This interface defines the context when scanning under a parent entity
// such as tagging assets to a location
interface parentScan {
  type: 'location' | 'department'
  id: string
  name: string
}

// Create a whitelist of allowed tables so users cannot modify the lookup() function
// to query other unapproved tables
const ALLOWED_TABLES = ['Asset', 'Staff', 'Location', 'Department'] as const

// Define the shape and structure for the allowed tables
type table = typeof ALLOWED_TABLES[number]


// ----------------------------------------------------------------------
//       Function to extract entity ID from the URL in a QR code
//                (either location or department id)
// ----------------------------------------------------------------------
/** Commented by Desmond @ 19-May-26
 * Extract the id from the URL of either a location or department QR code
 * 
 * QR codes now encode the full /scan/ URL:
 *    https://swinburne-assets.vercel.app/scan/location/E404
 *    https://swinburne-assets.vercel.app/scan/department/IT
 * 
 * Without this function, the full URL was passed and location or department_id
 * value to the DB lookup matched nothing.
 * 
 * @param raw - The raw string decoded from the QR code scanner
 * @returns The ID segment only (last path segment of the URL)
 */
function extractIdFromQrUrl(raw: string): string {
  // Remove the whitespaces from the end or beginning of the string
  const trimmed = raw.trim() 

  // If the scanned value looks like a URL, extract the last path segment
  // e.g https://swinburne-assets.vercel.app/scan/location/E404, returns "E404"
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      // Parse the trimmed string into a dedicated URL object that breaks the web
      // address down into readable components
      // pathname = /scan/location/E404 - segmented to become ['', 'scan', 'location',
      //                                                       'E404']
      const url = new URL(trimmed)

      const segments = url.pathname.split('/').filter(Boolean)

      // To get the last segment, use the segments entire length - 1 to get the 
      // correct index number
      const lastSegment = segments[segments.length-1]

      // Protection: The last segment must look like a valid entity ID
      // It should contain letters, digits, hyphens, underscores (max 30 characters)
      if (lastSegment && /^[A-Za-z0-9\-_]{1,30}$/.test(lastSegment)) {
        // Return the location or department_id
        return lastSegment
      }

    // Catch any errors
    } catch {
      // If the URL parsing failed, fall through and return the raw string since
      // it is not a URL
    }
  }
  // Return the trimmed value as a normal string (this could be a plain ID, or old QR
  // that only resembled a simple ID like E404 and not the newer URLs like
  // https://swinburne-assets/..... )
  return trimmed
}


// ----------------------------------------------------------------------
//                        Scanner fetch helpers
// ----------------------------------------------------------------------
// All database operations go through our API route instead of calling Supabase directly
// This prevents table names, column names and raw queries from showing in the browser Network tab
// This is the API abstraction layer which centralizes API calls and hides backend structure from frontend
// to prevent exposing the DB schema

// const scannerFetch = { lookup, post }
const scannerFetch = {
   // Lookup a record by scanned code (GET request with query params)
  lookup: async (table: table, idColumn: string, scannedCode: string) => {

    // Ensures the scanned code is not empty and also remove whitespaces
    if (!scannedCode.trim()) {
      return {
        // Filter out the incorrect scanned codes
        success: false,
        error: 'Invalid scan code'
      }
    }

    // Build the query string to convert 
    // { table: "Asset", idColumn: "asset_id", scannedCode: "A123" }
    // to table=Asset&idColumn=asset_id&scannedCode=A123
    const params = new URLSearchParams({ table, idColumn, scannedCode })
    // Sends the request to the API to fetch the data
    const res = await fetch(`/api/scanner?${params}`)

    // Proper error handling to prevent crashing application
    // Check the response before returning it
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`)
    }

    // Return the expected result, such as 'success': true
    return res.json()
  },
  
   // All write operations use POST with an action field
   // Record<string, unknown> to receive different strings, e.g. staffId or assetId
  post: async (body: Record<string, unknown>) => {
    // Sends the POST request
    const res = await fetch('/api/scanner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    // Proper error handling to prevent crashing application
    // Check the response before returning it
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`)
    }

    // Return the result
    return res.json()
  }
}

// ----------------------------------------------------------------------
//                        Scanner configurations
// ----------------------------------------------------------------------
// Define the fields or primary keys required for the key components to function
const configs = {
  asset: { 
    title: "Scan asset barcode", 
    description: "View and update asset's information", 
    icon: Package, 
    // idColumn and tableName
    idColumn: "asset_id", 
    tableName: "Asset" 
  },

  staff: { 
    title: "Scan staff ID", 
    description: "Assign/unassign ownership of asset(s) to staff", 
    icon: Users, 
    idColumn: "staff_id", 
    tableName: "Staff" 
  },

  location: { 
    title: "Scan location QR code", 
    description: "Access a location, then continue scanning asset barcode to tag asset(s) to location", 
    icon: MapPin, 
    idColumn: "location_id", 
    tableName: "Location" 
  },

  department: { 
    title: "Scan department QR code", 
    description: "Access a department, then continue scanning asset barcode to tag asset(s) to department", 
    icon: Building2, 
    idColumn: "department_id", 
    tableName: "Department" 
  }
} as const


// ----------------------------------------------------------------------
//                          Modal components
// ----------------------------------------------------------------------
/** Commented by Desmond @ 4-May-26
 * @function StaffConfirmedModal
 * @param staff - Staff data object
 * @param assetCount - Number of assets assigned
 * @param onContinue - Callback when the button is clicked, because () => void
 *  - shown after scanning a valid staff ID
 *  - confirms the staff identity
 *  - display how many assets are owned by staff
 *  - let user proceed to scan assets
 */
function StaffConfirmedModal({ staff, assetCount, onContinue }: {
  staff: Record<string, unknown>; assetCount: number; onContinue: () => void
}) {

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 bg-gradient-to-r from-green-600 to-green-500">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-6 h-6" />
            Staff Confirmed
          </h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-lg font-bold text-green-900">
              {/* Display the staff name, if not available then display empty */}
              {String(staff.name ?? '')}
            </p>

            <p className="text-sm text-green-700 mt-1">
              {/* Display staff ID, if not available then display empty */}
              ID: {String(staff.staff_id ?? '')}
            </p>

            <p className="text-sm text-green-700 mt-2">
              {/* Render based on asset count */}
              {assetCount > 0 
                 ? `Currently owns ${assetCount} asset(s)`
                 : 'No assets assigned'
              }
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">Now scan assets to assign or unassign them.</p>
          </div>
          
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t">
          <button onClick={onContinue} 
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg 
                             hover:bg-green-700 font-medium">
            Continue Scanning
          </button>
        </div>
      </div>
    </div>
  )
}

/** Commented by Desmond @ 4-May-26
 * @function ErrorModal
 * @message - The error message to display
 * @onClose - Callback to close the error modal
 *  - display error messages to the user
 *  - blocks the UI until dismissed
 */
function ErrorModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 bg-gradient-to-r from-red-600 to-red-500">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertCircle className="w-6 h-6" />
            Error
          </h3>
        </div>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 whitespace-pre-line">{message}</p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 border-t">
          <button onClick={onClose} 
                  className="w-full px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------
//                          Active page banner
// ----------------------------------------------------------------------
// function ActiveContextBanner({ parentScan, onClear }: { parentScan: parentScan; onClear: () => void}) {
//   const Icon = parentScan.type === 'location' ? MapPin : Building2

//   const colour = parentScan.type === 'location' ? 'bg-blue-600' : 'bg-green-600'

//   return (
//     <div className={`${colour} text-white px-4 py-3 flex items-center justify-between`}>
//       <div className='flex items-center gap-2'>
//         <Icon className='w-5 h-5 flex-shrink-0' />
//           <div>
//             <p className='text-xs font-semibold uppercase tracking-wide opacity-80'>
//               Tagging assets to {parentScan.type}
//             </p>

//             <p className='text-sm font-bold'>{parentScan.name} ({parentScan.id})</p>

//           </div>
//       </div>

//       <button onClick={onClear}
//               className='p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors'
//               title='Cancel and return to scan type selection'
//       >
//         <X className='w-4 h-4' />
//       </button>
//     </div>
//   )
// }

// ----------------------------------------------------------------------
//                              Main page
// ----------------------------------------------------------------------
export default function ScannerPage() {
  // Establish the app router to use router.push()
  // Redirecting users and navigating to different routes/pages
  const router = useRouter()

  // Block unauthenticated users from accessing this page, redirect to /login
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth()

  // URL query parameters - read from the URL like 
  // /users/scanner?type=location&scanLocation=B403
  const searchParams = useSearchParams()

  // The active scan type, determine which scanner config to use
  const type = (searchParams.get('type') || 'asset') as keyof typeof configs

  // QR redirection link params - set this when arriving from /scan/location or /scan/department
  // e.g. /scan/location/B403 from the QR links to
  // /user/scanner?scanLocation=B403
  const qrLocationId = searchParams.get('scanLocation')
  const qrDepartmentId = searchParams.get('scanDepartment')

  // ------------------------- Shared states ----------------------------------------
  // scanning - Camera active
  // confirmation - User checks the data
  // success - Operation completed
  const [pageState, setPageState] = useState<'scanning' | 'confirmation' | 'success'>('scanning')

  // Store the raw scanned result like { code: ICT-LAPTOP-001 }
  const [scannedItem, setScannedItem] = useState<Record<string, unknown> | null>(null)

  // Store the final processed result
  // Used in success screen and confirmation UI
  const [submittedData, setSubmittedData] = useState<{ 
    item: Record<string, unknown>, page: string 
  } | null>(null)

  // Scanner re-render mechanism - Force React to remount the component
  // To reset the scanner (camera)
  const [scannerKey, setScannerKey] = useState(0)

  // Controls when the scanner should start automatically
  const [shouldStartScanning, setShouldStartScanning] = useState(false)

  // Parent scan context for when user scans a QR and gets redirected here
  // It represents:
  // {
  //   type: 'location' | 'department',
  //   id: string,
  //   name: string
  // }

  // For instance, tag all scanned assets to location B403
  const [parentScan, setParentScan] = useState< parentScan | null>(null)

  // -------------------- Staff assignment workflow ------------------------
  // Store current scanned staff
  const [staffData, setStaffData] = useState<Record<string, unknown> | null>(null)

  // Temporary storage for assets to assign/unassign
  // Named as 'cart' or 'shopping cart' for ease of understanding
  // This is because we can scan more than one asset to tag to a location or department
  const [cart, setCart] = useState<cartItem[]>([])

  // Controls the visibility of the StaffConfirmedModal
  const [showStaffModal, setShowStaffModal] = useState(false)

  // Commented by Desmond @ 19-May-26: Fix the issue where scanning a staff ID
  // successfully would directly led to it being checked if it's an asset ID and 
  // failing
  // Here, track the staff ID that was just scanned so we can skip it on the very next
  // scan event.
  const staffIdScannedRef = useRef<string | null>(null)

  // Error handling - use a centralized error handling UI
  const [showErrorModal, setShowErrorModal] = useState(false)
  // Error message and setting the error message
  const [errorMessage, setErrorMessage] = useState('')

  // Select the correct scanner configuration and fallback to asset if other types are invalid
  const config = configs[type] ?? configs.asset


  // ----------------------------------------------------------------------
  //          QR code redirection link: Set parentScan on mount
  // ----------------------------------------------------------------------
  /** 
   * When the user arrives from scanning a QR sticker scan (/scan/location/G001), the
   * /scan/location/[id]/route.ts redirect already validated the record exists.
   * We will fetch the entity name so the banner shows "Room G-001" and not just G001
   * 
   * What it does it initializing the scanner context when user enters the page via a QR code
   * redirect.
   * Then, gets redirected to /user/scanner?scanLocation=B403 or scanDepartment=id
   * This code fetches the location/department details and set the scanner to 'tagging mode' to
   * tag asset_id to location or department.
  */
 useEffect(() => {
  // Cannot use async inside useEffect directly, so assign it to a const
  // entityType = 'location' or 'department'
  // entityId = ID string from the QR code
  const applyQrContext = async(entityType: 'location' | 'department', entityId: string) => {
    try {
      const idColumn = entityType === 'location' ? 'location_id' : 'department_id'

      const tableName = entityType === 'location' ? 'Location' : 'Department'

      // Fetch the entity details from the API
      const result = await scannerFetch.lookup(tableName, idColumn, entityId)

      // If the fetch failed or the entity cannot be found, show an error message
      if (!result.success || !result.data) {
        // Entity was deleted between the QR redirect and now, a rare occurrence
        setErrorMessage(
          `The scanned ${entityType} (${entityId}) cannot be found.\n` +
          `It may have been removed. Please contact your administrator.`
        )

        // Show the error modal with the message
        setShowErrorModal(true)
        // Stop execution immediately
        return
      }

      // Stores the parent scan context, such as { type: 'location', id: 'B403', name: 'Room B403' }
      setParentScan({
        type: entityType,
        id: entityId,
        // Ensure the value becomes a string and fallback to the entity ID if name is not available
        name: String(result.data.name ?? entityId)
      })

      // Auto start the scanning so that user won't have to tap anything
      setShouldStartScanning(true)
    // Catch any errors
    } catch {
      // Set the error message
      setErrorMessage(`Failed to load ${entityType} details. Please try again.`)
      // Show the error modal
      setShowErrorModal(true)
    }
  }
  
  // Check if we have a location QR param, if not check for department QR param
  if (qrLocationId) {
    applyQrContext('location', qrLocationId)
  } else if (qrDepartmentId) {
    applyQrContext('department', qrDepartmentId)
  }

 }, []) // Run once on mount and the search params don't change after initial render


 // Reset the page state when the scan type changes, such as user scanning a location QR, then going back and scanning a staff QR
 // We should reset the page state and all contexts
  useEffect(() => {
    // Reset the UI back to default scanner screen
    setPageState('scanning')
    // Clear the previously scanned items
    setScannedItem(null)
    // Clear the previous submitted data to prevent it from showing in the success screen
    setSubmittedData(null)
    // Remove the active location/department tagging context
    // However, do NOT reset parentScan if it came from QR redirection
    // Only reset if the user manually changes the scan type
    if (!qrLocationId && !qrDepartmentId) {
      setParentScan(null)
    }
    // Clear the active selected staff member from the assign asset to staff workflow
    setStaffData(null)
    // Empties the cart to prevent items from previous staff scan showing up in the new staff scan
    setCart([])
    // Force the scanner component to remount
    // This is a functional update where we get the previous key and increment it by 1 to ensure a new key value
    setScannerKey(prev => prev + 1)
  }, [type, qrLocationId, qrDepartmentId]) // Run whenever the scan type changes
  // /user/scanner?type=asset or staff or location or department


  // Show nothing while checking session, or if not logged in (useAuth will redirect them)
  if (isAuthLoading || !isAuthenticated) {
    return null
  }


  // ----------------------------------------------------------------------
  //                            Cart type
  // ----------------------------------------------------------------------
  // Define the structure of each item in the cart while assigning/unassigning assets to staff
  interface cartItem {
    // Unique identifier for the cart item
    id: number
    // Asset object with attributes from the database
    asset: Record<string, unknown>
    // Allow three states - ASSIGN to assign asset to employee, UNASSIGN to unassign asset from employee, 
    // ERROR to indicate the asset cannot be processed (e.g. already assigned to another staff)
    action: 'ASSIGN' | 'UNASSIGN' | 'ERROR'
    // Optional field to check for the current owner of the asset, 
    // used to determine if we are assigning or unassigning
    currentOwner?: string
    // Store the assignment ID if the asset is currently assigned, 
    // so that we can unassign by ID later instead of by staffId + assetId 
    // which can cause issues when an asset is reassigned to another staff before we submit the cart
    assignmentId: string
  }


  // ----------------------------------------------------------------------
  //               Cancel handler (Active-context header strip)
  // ----------------------------------------------------------------------
  /**
   * Called when the user taps Cancel in the active-context header strip while scanning
   * a QR code.
   * To do this, setShouldStartScanning(false) must be called before the key increment
   * and before router.replace(). If it is called after, the newly mounted scannerContext
   * receives shouldStartScanning = true, in its first render and auto-starts the camera
   * , making Cancel appear to do nothing when user presses it.
   */
  const handleCancelParentScan = () => {
    // Firstly, disable auto-start before remounting scannerContext
    setShouldStartScanning(false)

    // Secondly, clear the parent scan state to hide the header strip
    setParentScan(null)

    // Thirdly, clear the cart accumulated items during the tagging session
    setCart([])

    // Fourth, remount scannerContext in a clean idle state by incrementing the key
    setScannerKey(prev => prev + 1)

    // Fifth, remove the query params from the URL so applyQrContext() cannot
    // retrigger. router.replace() does not add a history entry.
    router.replace('/user/scanner')
  }


  // ----------------------------------------------------------------------
  //                          Scan handlers
  // ----------------------------------------------------------------------
  /** Control three main workflows which are
   *  1 - Assign / unassign assets to staff
   *  2 - QR Context Tagging: Tag assets to a location or department using scanned QR code redirection
   *  3 - Normal scanning of assets, locations or departments without QR code context, 
   *      which routes to the confirmation page
   */
  const handleItemScanned = async (item: { code: string }) => {
    // Removes whitespaces from scanned items to prevent lookup from breaking
    const scannedCode = item.code.trim()

    // ----------------------------------------------------------------------
    //                Path 1 - Assign asset to staff
    // ----------------------------------------------------------------------
    if (type === 'staff') {
      // If no staff member is selected
      if (!staffData) {
        // Scanned code should represent a staff ID
        try {
          // Lookup the staff details using the scanned code
          // Which then sends an API request -
          // /api/scanner?table=Staff&idColumn=staff_id&scannedCode=104401021
          const staffResult = await scannerFetch.lookup('Staff', 'staff_id', scannedCode)

          // If the lookup failed or the staff ID cannot be found, show an error message
          if (!staffResult.success || !staffResult.data) {
            // Set the error message
            setErrorMessage(`Staff ID not found: ${scannedCode}\n\n
                             Please verify the staff ID exists in the database.
                           `)
            // Afterwards, show the error modal with the error message attached
            setShowErrorModal(true)
            return
          }

          // If the staff is found, check how many assets they own
          const countResult = await scannerFetch.post({ 
            action: 'count_staff_assets', 
            staffId: scannedCode 
          })

          // Update the asset count in the staff data, which will be showed in the confirmationModal
          setStaffData({ 
            // Spread operator to copy all staff properties
            ...staffResult.data, 
            currentAssetCount: countResult.count ?? 0 
          })

          // Commented by Desmond @ 19-May-26: Remember the scanned staff ID code
          // so that it is skipped before scanning for asset ID
          staffIdScannedRef.current = scannedCode

          // Opens the confirmation modal
          setShowStaffModal(true)
        
        // Catch the errors
        } catch { 
          // Set the error message
          setErrorMessage('Error validating staff. Please try again.')
          // Show the error modal
          setShowErrorModal(true)
          return
        }
      }

      // Commented by Desmond @ 19-May-26: Skip the staff ID that was just scanned
      // to prevent it from being checked as an asset
      if (staffIdScannedRef.current === scannedCode) {
        // Resets the staff ID scanned ref back to null
        staffIdScannedRef.current = null
        // Exit early
        return
      }

      // Add Asset to Staff Cart
      try {
        // Checks if any of the cart item's asset_id is the same as the scanned code
        // If so, immediately let the staff know that they have already scanned this asset
        // to prevent duplicate entries in the cart
        if (cart.some(cartItem => cartItem.asset.asset_id === scannedCode)) {
          setErrorMessage(`Asset ${scannedCode} is already in cart!`)
          setShowErrorModal(true)
          return
        }

        // Lookup the asset to make sure it exists before adding to cart
        const assetResult = await scannerFetch.lookup(
          'Asset', 'asset_id', scannedCode
        )

        // If asset lookup failed or the asset cannot be found, show error message
        if (!assetResult.success || !assetResult.data) {
          setErrorMessage(`Asset not found: ${scannedCode}`)
          setShowErrorModal(true)
          return
        }

        // Check if the asset is already assigned to somebody else
        const assignResult = await scannerFetch
          .post(
            { 
              action: 'check_asset_assignment', 
              assetId: scannedCode 
            }
          )

        // If the API call failed , show empty array
        // Then, assert as an array with staff_id and id (assignment ID) fields
        const assignments = (assignResult.data ?? []) as Array<{ staff_id: string, id: string }>

        // Retrieve the fist assignment record from the 'assignments' array.
        // If it's empty, set currentAssignment to null
        const currentAssignment = assignments[0] ?? null
        // Checks if the asset is currently assigned to the same staff that is being scanned
        // If so, the action will be to 'UNASSIGN' the asset
        // If the asset is assigned to another staff, show an 'ERROR' action
        const ownedByThisStaff = currentAssignment?.staff_id === staffData?.staff_id

        // If the asset is currently assigned to this staff, then the action would be to unassign it
        const action = ownedByThisStaff ? 'UNASSIGN' : currentAssignment ? 'ERROR' : 'ASSIGN'

        // Update the cart with the new asset and its action, 
        // along with the current owner for reference
        // Functional updates using prev is to ensure we are always working with 
        // the latest state of the cart
        setCart(prev => [...prev, {
            // Unique timestamp ID for each cart item
            id: Date.now(), 
            // Store the full asset data returned from the API
            asset: assetResult.data, 
            // Action to either ASSIGN, UNASSIGN or show ERROR if the asset is assigned to another staff
            action,
            // Store the current owner of the asset, if any
            currentOwner: currentAssignment?.staff_id, 
            // Store the cart assignment ID to allow unassign by ID later instead of by staffId + assetId 
            // which can cause issues when an asset is reassigned to another staff before we submit the cart
            assignmentId: currentAssignment?.id 
          }])

      // Catch the errors
      } catch { 
        setErrorMessage('Error checking asset. Please try again.')
        setShowErrorModal(true)
      }
      return
    }

    // ----------------------------------------------------------------------
    //       Path 2 - Location / Department tagging from QR redirection
    // ----------------------------------------------------------------------
    /**
     * When parentScan is already set (either from QR scan or from scanning a
     * location/department QR in-app), every subsequent scan is an asset.
     * We immediately tag the asset to the parent entity.
     */
    if (parentScan !== null) {
      // User scan a location or department QR code, then gets redirected to /user/scanner?scanLocation=B403
      // then proceed to scan asset barcode to tag to the location/department
      try {
        // Check if the asset is already in the cart
        if (cart.some(cartItem => cartItem.asset.asset_id === scannedCode)) {
          setErrorMessage(`Asset ${scannedCode} is already in cart! Please submit or clear the cart before scanning again.`)
          setShowErrorModal(true)
          return
        }

        // Lookup asset to make sure it exists
        const assetResult = await scannerFetch.lookup(
          'Asset', 'asset_id', scannedCode
        )

        // If asset lookup failed or could not be found
        if (!assetResult.success || !assetResult.data) {
          if (parentScan) {
            setErrorMessage(`Asset ${scannedCode} not found in database.`)
            setShowErrorModal(true)
          }

          // Asset not found - route the user to the confirmation page
          setScannedItem(item as unknown as Record<string, unknown>)
          // Exit early
          return
        } 
        
        // Commented by Desmond @ 14-May-26: Here onwards, instead of immediately tagging 
        // the asset to the location/department, add to cart first so that multiple assets 
        // can be scanned and tagged in one go

        // Determine the primary key field to update based on the parent scan type
        // const field = parentScan.type === 'location' ? 'location_id' : 'department_id'

        // Add asset to cart
        setCart(prev => [...prev, {
          // Unique timestamp ID for each cart item
          id: Date.now(),
          // Store te full asset object
          asset: assetResult.data,
          // For location/department tagging, we set the action to ASSIGN
          action: 'ASSIGN',
          // Not used for location/department tagging but set to empty string to satisfy the type
          assignmentId: ''
        }])

        // Send a API request to tag the asset to the location or department
        // const result = await scannerFetch.post({
        //   // Action name to indicate the type of operation we want to perform in the backend
        //   action: 'tag_asset',
        //   // Asset ID code
        //   assetId: scannedCode,
        //   // The primary key field
        //   field,
        //   // Represents the location_id or department_id value to tag to
        //   value: parentScan.id
        // })

        // // If the tagging operation failed, show an error message
        // if (!result.success) {
        //   throw new Error(result.error ?? 'Tagging failed')
        // }

        // // Create a new object to represent the updated asset data after 
        // // tagging, by copying the original asset data and updating the 
        // // relevant field with the parent scan ID
        // const updatedAsset = {
        //   // Spread operator to copy all original asset properties
        //   ...assetResult.data, 
        //   // Dynamically set the field to either location_id or department_id 
        //   // based on the parent scan type
        //   // e.g. location_id: "B403"
        //   [field]: parentScan.id
        // }

        setSubmittedData({
          // Store the updated asset object from earlier
          item: assetResult.data,
          // Show temporary feedback to the user that the asset has been added to cart
          page: `Added to cart`
        })
        // Display the success screen
        // setPageState('success')
        // Keep the parentScan active still, so that user can scan the next asset immediately

        // Catch any errors
      } catch (err: unknown) {
        setErrorMessage(`Error tagging asset: ${err instanceof Error ? err.message : String(err)}`)
        setShowErrorModal(true)
      }
      // Exit early to prevent going to the confirmation page
      return
    }


    // ----------------------------------------------------------------------
    //        Path 3 - Normal asset / location / department scan
    // ----------------------------------------------------------------------
    // Commented by Desmond @ 19-May-26: First, extract the entity ID from the QR code
    // URL before querying the DB. This is because the QR codes now embed the full
    // /scan/ URL, and not just the plain ID string.

    if (type === 'location' || type === 'department') {
      // Firstly, parse the ID out of the full scan URL
      const entityId = extractIdFromQrUrl(scannedCode)

      // User is scanning a location or department without QR code context, 
      // which means they want to set the parentScan context by scanning the 
      // location/department QR in-app
      const result = await scannerFetch.lookup(
        // Ensure the table name is correct based on the scan type, either Location or Department
        config.tableName, 
        config.idColumn, 
        // Fetch the location or department_id using the entityId parsed from the URL
        entityId
      )

      // If the lookup failed or the location/department cannot be found, show an error message
      if (!result.success || !result.data) { 
        alert(`Error: ${type} ID "${entityId}" not found.`) 
        return
      }

      // If the lookup is successful, set the parentScan context to enable tagging mode
      setParentScan({ 
        type: type, 
        id: entityId,
        // If name cannot be found, fallback to use scannedCode
        name: result.data.name ?? entityId 
      })

    } else {
      // Go back to confirmation
      setScannedItem(item as unknown as Record<string, unknown>);
      setPageState('confirmation');
    }
  }
  //   // Step B: Tagging an Asset to the Location/Department
  //   else {
  //     try {
  //       const assetResult = await scannerFetch.lookup('Asset', 'asset_id', scannedCode);

  //       if (!assetResult.success || !assetResult.data) {
  //         // ASSET NOT FOUND: Proceed to Registration Screen seamlessly
  //         setScannedItem(item);
  //         setPageState('confirmation');
  //         return;
  //       }

  //       // ASSET FOUND: Update immediately and show success (Cart skipped)
  //       const result = await scannerFetch.post({
  //         action: 'tag_asset',
  //         assetId: scannedCode,
  //         field: config.idColumn,
  //         value: parentScan.id,
  //       });

  //       if (!result.success) throw new Error(result.error || 'Update failed');

  //       const updatedAssetData = { ...assetResult.data, [parentScan.type + '_id']: parentScan.id };
  //       setSubmittedData({ item: updatedAssetData, page: `Tagged to ${parentScan.name}` });
  //       setPageState('success');
  //       setParentScan(null);

  //     } catch (e: any) {
  //       setErrorMessage(`Error tagging asset: ${e.message}`);
  //       setShowErrorModal(true);
  //     }
  //   }
  // };

  // ----------------------------------------------------------------------
  //                          Staff handlers
  // ----------------------------------------------------------------------
  // Closes the staff confirmed modal and start scanning assets to assign/unassign to the staff
  const handleStaffContinue = () => {
    setShowStaffModal(false)
    setShouldStartScanning(true)
  }


  // Remove an asset from the cart
  // id here is the unique timestamp ID we assigned to each cart item, not the asset ID
  // id of cart item to remove
  const removeFromCart = (id: number) => { 
    // Update the cart by filtering out the item with the matching ID
    // Then, remove that item specifically from the cart state
    setCart(
      // prev - represents the current value/state of the cart before the update
      // .filter() - create a new array containing only items that do not match 
      // the specified ID, effectively removing the item with that ID from the cart
      prev => prev.filter(item => item.id !== id)
    )
  }

  // const handleErrorClose = () => {
  //   setShowErrorModal(false);
  //   setErrorMessage('');
  // }

  // ----------------------------------------------------------------------
  //            Submit cart items to assign asset to staff
  // ----------------------------------------------------------------------
  const handleSubmitCart = async () => {
    // If there is nothing in the cart
    if (cart.length === 0) {
      setErrorMessage('No items in cart to submit!')
      setShowErrorModal(true)
      // Exit early
      return
    }

    try {
      // --------------- Staff workflow --------------------
      if (type === 'staff' && staffData) {
        const validItems = cart.filter(item => item.action !== 'ERROR')

        // Filter out the valid cart items to remove the ones with 'ERROR' action 
        // which cannot be processed
        // Only keep the items with 'ASSIGN' or 'UNASSIGN' action to be processed in the backend
        if (validItems.length === 0) {
          setErrorMessage('No valid items to submit!')
          setShowErrorModal(true)
          return
        }

        for (const item of validItems) {
          if (item.action === 'ASSIGN') {
            await scannerFetch.post({
              action: 'assign',
              staffId: staffData.staff_id,
              assetId: item.asset.asset_id
            })
          } else if (item.action === 'UNASSIGN') {
            await scannerFetch.post({
              action: 'unassign',
              assignmentId: item.assignmentId
            })
          }
        }
        setSubmittedData({
          item: { 
            name: `${validItems.length} items processed`, 
            code: 'BULK' 
          },
          page: 'Staff Assignment'
        })

        // Empty the selected staff after submission to prevent confusion when 
        // user goes back to scan another staff
        setStaffData(null)

      // -------------- Location/Department tagging workflow --------------------
      } else if ((type === 'location' || type === 'department') && parentScan) {
        const field = parentScan.type === 'location' ? 'location_id' : 'department_id'

        for (const item of cart) {
          await scannerFetch.post({
            action: 'tag_asset',
            assetId: item.asset.asset_id,
            field,
            value: parentScan.id
          })
        }

        setSubmittedData({
          item: {
            name: `${cart.length} asset(s)`,
            code: 'BULK'
          },
          page: `Tagged to ${parentScan.type === 'location' ? 'Location' : 'Department'}: ${parentScan.name}`
        })
      }

      // After submission, show the success page with the number of items processed, 
      // not the individual asset details because it can be more than one item in the cart
      setPageState('success')
      // Empty the cart after submission
      setCart([])

    // Catch the errors
    } catch (err: unknown) {
      // Set the error message
      setErrorMessage(`Error submitting: ${err instanceof Error ? err.message : String(err)}`)
      // Display the error modal with the error message
      setShowErrorModal(true)
    }
  }

  // ----------------------------------------------------------------------
  //                    Asset confirmation handlers
  // ----------------------------------------------------------------------
  const handleAssetUpdate = async (newData: Record<string, unknown>) => {
    if (!scannedItem || type !== 'asset') {
      // TODO: How can we improve this by providing more context to the user?
      alert("Error")
      // Exit early
      return
    }

    try {
      // Note: the actual database write (asset condition/location/department
      // update + audit log entry) already happens in ConfirmationContent's
      // saveToDb() call to /api/saveMaintenance, before onSubmit fires.
      // This handler should only reflect the result in the UI — it must NOT
      // perform another write, or the asset gets updated twice and the
      // audit log gets a duplicate "no changes" entry.

      // After successful update, set the submitted data to show in the success page
      setSubmittedData({ 
        item: { 
          ...newData 
        }, page: type 
      })

      setPageState('success');
    
    // Catch the errors
    } catch (err: unknown) { 
      alert(err instanceof Error ? err.message : String(err))
    }
  }

  // ----------------------------------------------------------------------
  //         Create new asset if asset barcode not found in database
  // ----------------------------------------------------------------------
  const handleAssetCreate = async (newData: Record<string, unknown>) => {
    // Check if we have the scanned item and the scan type is asset
    if (!scannedItem) { 
      // Exit early
      return
    }

    try {
      // const dataToInsert: any = {
      // Create object to send to backend API to create a new asset with the scanned code
      const payload: Record<string, unknown> = {
        // Action name for the backend API to identify action
        action: 'create_asset',
        // asset_id will be the scanned code
        asset_id: scannedItem.code,
        // asset name
        name: newData.name,
        // description
        description: newData.description,
        // condition of the asset
        condition: newData.condition,
        // category
        category: newData.category,
        // model
        model: newData.model,
        // the location of the asset
        location_id: newData.location_id,
        // department the asset belongs to
        department_id: newData.department_id,
      }

      // If we have a parent context from being redirected to the application
      // by scanning a location or department QR code
      if (parentScan) {
        // dataToInsert[parentScan.type + '_id'] = parentScan.id
        // Decide the field to update based on the parent scan type
        const field = parentScan.type === 'location' ? 'location_id' : 'department_id'
        // Dynamically set the field to either location_id or department_id based on the parent scan type
        payload[field] = parentScan.id
      }

      // Debug line: To show exactly what Zod is rejecting
    console.log("Sending Payload to API:", JSON.stringify(payload, null, 2));

      // Send the data to the backend API to create the new asset record in the database
      const result = await scannerFetch.post(payload)

      // If the previous action failed
      if (!result.success) {
        // Throw an error to be caught by the catch statement
        throw new Error(result.error || 'Asset were unable to be created')
      }

      // Add the success label
      // const successPageLabel = parentScan ? `Tagged to ${parentScan.name}` : 'New Asset Registered';

      // Set the submitted data to be displayed in the success page
      setSubmittedData({ 
        item: payload, 
        // page: successPageLabel 
        page: parentScan ? `Tagged to ${parentScan.name}` : 'New Asset Registered'
      })

      setPageState('success')
      setParentScan(null)
    } catch (err: unknown) { 
      alert(err instanceof Error ? err.message : String(err))
    }
  }


  // ----------------------------------------------------------------------
  //                Render the pages based on page state
  // ----------------------------------------------------------------------
  // If page state is success
  if (pageState === 'success') {
    // const scanType = (submittedData?.page === 'New Asset Registered' || submittedData?.page.startsWith('Tagged')) ? submittedData.page : configs[type].title.split(" ")[0];
    // return <SuccessContent scannedCount={submittedData ? 1 : 0} scanType={scanType} item={submittedData?.item} />;
    
    return (
      <SuccessContent 
        // If at least one successful scan happened 
        scannedCount={submittedData ? 1 : 0}

        scanType={
          submittedData?.page === 'New Asset Registered' || submittedData?.page?.startsWith('Tagged')
            ? (submittedData?.page ?? 'Asset')
            : configs[type].title.split(' ')[0]
        }

        // If submitted data exists, pass the item
        item={submittedData?.item ?? null}
        // On scan another, reset the page state to scanning and clear the scanned item and submitted data
        onScanAnother={() => {
          // Stay in tagging mode if a QR context is active
          setPageState('scanning')
          // Clear the scanned item
          setScannedItem(null)
          // Clear the submitted data
          setSubmittedData(null)
          // Force the scanner to remount and reset by changing the key
          setScannerKey(prev => prev + 1)

          // Re-trigger auto start if we still have a parentScan
          if (parentScan) {
            setShouldStartScanning(true)
          }

        }}
      />
    )
  }


  // If the pageState is confirmation
  if (pageState === 'confirmation') {
    // FIX: Dynamic routing to ensure Location/Department parent scans look inside the Asset table, not themselves.
    const targetTable = parentScan ? 'Asset' : config.tableName;

    return (
      <ConfirmationContent 
      // use the scanned item's code
        item={scannedItem ?? { code : '' }} 
        // table name
        tableName={targetTable} 
        // when going back, set the page to scanning
        onBack={() => setPageState('scanning')} 
        // when submitting, use handleAssetUpdate to update the existing asset
        onSubmit={handleAssetUpdate} 
        // create a new asset if the scanned asset barcode is not found in the database
        // use handleAssetCreate
        onCreate={handleAssetCreate} 
        // parent scan context to pass down to the confirmation page so that we can show relevant information
        parentScan={parentScan} 
      />
    )
  }


  // ----------------------------------------------------------------------
  //                          Scanning state
  // ----------------------------------------------------------------------
  return (
    <div className="relative">

      {/* Commented by Desmond @ 1-May-26
          QR redirection banner - shown when parentScan is active is let the user know
          if they are in a Location or Department scan
      */}
      {/* {parentScan && (
        <ActiveContextBanner
          parentScan={parentScan}
          onClear={() => {
            //
            setParentScan(null)
            //
            setScannerKey(prev => prev + 1)
          }}
        />
      )} */}

      {/* ---------------------------- Main content --------------------------------- */}
      <ScannerContent
      // When key changes, force the ScannerContent component to remount, which resets the internal
      // state of the scanner to have a fresh state
        key={scannerKey}
        // Commented by Desmond @ 12-May-26: I have no idea why the logic works like this as I did not write this code
        // but I will try to explain it anyways.
        // Well, this dynamically chooses the prop so that if staffData exists, 
        // we will show the staff scanning UI with the title "Asset Scanner" and description 
        // "Scan assets to assign/unassign for {staff name}"
        
        // Otherwise, just use the normal config for the scan type, which can be asset, location or department
        {...(staffData ? {
          title: "Asset Scanner",
          description: `Scan assets to assign/unassign for ${staffData.name}`,
          icon: Package,
          idColumn: "asset_id",
          tableName: "Asset"
        } : config)}
        // Whenever an item is scanned, call the handleItemScanned function to process the scanned item`
        onItemScanned={handleItemScanned}
        // When user clicks the back button in the scanner UI, route them back to the dashboard
        onBack={() => router.push('/user/dashboard')}
        // Whenever the user clicks the Cancel button in the header strip of the 
        // scanner page
        onCancel={handleCancelParentScan}
        // Pass down the parentScan context to the ScannerContent component so that it can be used
        //  to determine the scanning mode and show relevant information in the UI
        parentScan={parentScan}
        // Auto start the scanner if we have staff data from scanning a staff QR code, 
        // or if we have parent scan context from scanning a location/department QR code
        // !! this symbol converts the value into a boolean
        autoStart={!!staffData || !!parentScan}
        // Controls whether the scanner should trigger scanning mode
        shouldStartScanning={shouldStartScanning}
        // When scanner starts successfully, set shouldStartScanning to false to prevent it 
        // from being triggered again unintentionally
        onScanningStarted={() => setShouldStartScanning(false)}
      >

        {/* Commented by Desmond @ 14-May-26: Moved the cart inside the Scanner Content so that cart is above the 
            Back to Home button */}
        {/* ----------------- Cart to hold assets to assign to a staff / location / department  --------------- */}
        {cart.length > 0 && (type === 'staff' || type === 'location' || type === 'department' ) && (
          <div className="mt-4 px-4 pb-20">
            <div className="bg-white border-2 border-red-600 rounded-lg shadow-lg">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-red-600" /> Cart ({cart.length})
                  </h3>
                  
                  <button onClick={() => setCart([])} className="p-1 hover:bg-gray-100 rounded">
                    <X className="w-5 h-5" />
                  </button>

                </div>

                <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                  {cart.map((item) => (
                    <div key={item.id} 
                        className={`flex items-center justify-between p-3 rounded border 
                                    ${item.action === 'ERROR' ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}
                                  `}>

                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {String(item.asset.name ?? item.asset.asset_id)}
                        </p>

                        <p className="text-xs font-bold">
                          { type === 'staff' 
                            ? (item.action === 'ASSIGN')
                              ? 'Assign to Staff'
                              : item.action === 'UNASSIGN'
                                ? 'Unassign from Staff'
                                : 'Error: Already to another staff' 
                            : parentScan
                              ? `Tagging to ${parentScan.type === 'location' ? 'Location' : 'Department'}`
                              : 'Pending'
                          }
                          {/* {item.action === 'ASSIGN' ? 'Assigning to Staff' : item.action === 'UNASSIGN' 
                                                    ? 'Removing from Staff' : 'Error: Owned by others'} */}
                        </p>

                        {item.action === 'ERROR' && (
                          <p className="text-xs text-red-600">Owner: {item.currentOwner}</p>
                        )}

                      </div>

                      <button onClick={() => removeFromCart(item.id)} 
                              className="p-2 text-red-600 hover:bg-red-100 rounded ml-2">
                        <Trash2 className="w-5 h-5" />
                      </button>

                    </div>
                  ))}
                </div>

                <button onClick={handleSubmitCart} 
                        disabled={cart.filter(i => i.action !== 'ERROR').length === 0} 
                        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 
                                  flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" /> Submit Changes
                </button>

              </div>
            </div>
          </div>
        )}
        
      </ScannerContent>


      {/* Show the staff modal when both conditions are met and staffData is present as well */}
      {showStaffModal && staffData && (
        <StaffConfirmedModal 
          staff={staffData} 
          assetCount={Number(staffData.currentAssetCount ?? 0)} 
          onContinue={handleStaffContinue} 
        />
      )}


      {/* When showErrorModal is true, show the following error modal */}
      {showErrorModal && (
        <ErrorModal 
          message={errorMessage} 
          onClose={() => { 
            setShowErrorModal(false)
            setErrorMessage('')
          }} 
        />
      )}

    </div>
  )
}