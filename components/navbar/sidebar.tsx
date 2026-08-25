// components/navbar/sidebar.tsx
'use client'

/** Commented by Desmond @ 20-April-26
 * @file sidebar.tsx
 * @description Sidebar component for the application.
 * This component renders a sidebar with different modules and dropdowns based on the user's role.
 */
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  UsersIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline'
import LogoutButton from '../logoutButton'
import { HomeIcon } from 'lucide-react'
import { useSession } from "next-auth/react"

// Commented by Desmond @ 20-April-26
// These arrays define what appears in the sidebar for each role.
// Each item has:
//  name - label shown in the sidebar
//  icon - the heroicons component to show beside the label
//  href - the base URL for this section
//  dropdown - (optional) and will show sub-items when section is expanded

// ---------- Navigation options available for the admin users ----------
const adminModules = [
  // Dashboard for admins
  { 
    name: 'Home', 
    icon: HomeIcon, 
    href: '/admin/dashboard' 
    // No dropdown for Home
  },
  // Asset tracking module - create, update, delete assets and manage maintenance requests
  {
    name: 'Asset Tracking',
    icon: ComputerDesktopIcon,
    href: '/admin/assetTracking',
    dropdown: [
      { label: 'Audit Log', path: 'auditLog' },
      { label: 'Assets', path: 'assets' },
      { label: 'Maintenance', path: 'maintainApprove' },
      { label: 'Bulk Import', path: 'addMoreAssets' }

    ],
  },
  // Location module - manage campus locations and their details
  {
    name: 'Location',
    icon: MapPinIcon,
    href: '/admin/location',
    dropdown: [
      { label: 'Rooms', path: 'rooms' },
    ],
  },
  // Department module - manage campus departments and their details
  {
    name: 'Department',
    icon: BuildingOfficeIcon,
    href: '/admin/department',
    dropdown: [
      { label: 'Units', path: 'units' },
    ],
  },
  // Staff module - manage staff accounts and registration approvals
  {
    name: 'Staff',
    icon: UsersIcon,
    href: '/admin/staff',
    dropdown: [
      // List of staff
      { label: 'List', path: 'list' },
      // Approve or reject staff account registrations
      { label: 'Approvals', path: 'approvals' },
      // { label: 'Roles', path: 'roles' },
    ],
  },
]

// ----------- Navigation options available for staff users ----------
// *currently only main menu, but can be expanded in the future
const staffModules = [
  // Dashboard for staffs
  { 
    name: 'Main Menu', 
    icon: HomeIcon, 
    href: '/user/dashboard' 
  },
]

// -------------- Sidebar component ---------------
/** Commented by Desmond @ 20-April-26
 * @param isOpen - Whether the sidebar is open and visible
 * @param setIsOpen - Callback to show or hide the sidebar
 */
export default function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (value: boolean) => void }) {
  // Next-auth session - used to determine the user role
  const { data: session } = useSession()
  // The current URL path - to highlight the active menu item
  const pathname = usePathname()
  // The user role from the session, and fallback to 'staff'
  const userRole = session?.user.role ?? 'staff'

  // activeItem - currently expanded dropdown section
  // null - no dropdown is open
  const [activeItem, setActiveItem] = useState<string | null>(null)

  // hoveredItem - name of item currently hovered by mouse
  // null - no item is being hovered
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  
  // isMobile -whether the viewport is in mobile width (<768px)
  // Initialized immediately from window.innerWidth to avoid flash of wrong layout, or hydration mismatch
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)

  // ------ Restore the last-open dropdown state from localStorage on mount -----
  useEffect(() => {
    const savedActiveItem = localStorage.getItem('sidebarActiveItem')
    // Set active item to saved value, null if there is none
    if (savedActiveItem) {
      setActiveItem(savedActiveItem)
    }
  }, []) // Only run once on mount

  // ------------- Handle responsive resize behavior -------------
  // When transition from mobile to desktop, open sidebar
  // Desktop to mobile, close sidebar
  useEffect(() => {
    const handleResize = () => {
      // If window width is less than 768px, then it is mobile
      setIsMobile(window.innerWidth < 768)

      // Check if the screen size changed from mobile to desktop or other way around
      // window.innerWidth < 768 is the new state, isMobile is the new state
      // so if they are different, then screen size changed
      if (window.innerWidth < 768 !== isMobile) {
        // If less than 768px, then close sidebar, otherwise open
        setIsOpen(!(window.innerWidth < 768))
      }
    }

    // Run on mount to sync state with the current window size 
    handleResize()
    // Add event listener for window resizing
    window.addEventListener('resize', handleResize)
    // When unmount, remove the event listener to prevent memory leaks
    return () => window.removeEventListener('resize', handleResize)

  }, [setIsOpen, isMobile]) // Re-run this if 'setIsOpen' or 'isMobile' changes


  // Toggle dropdown open or closed when clicking on dropdown section
  const toggleDropdown = (href: string) => {
    // If clicking an already active dropdown, close it. Otherwise, open the new one.
    const newActive = activeItem === href ? null : href
    // Save the new active dropdown state
    setActiveItem(newActive)
    localStorage.setItem('sidebarActiveItem', newActive || '')
  }


  // ---------- Handle clicking outside the sidebar ----------
  // On mobile, clicking outside the sidebar closes it
  const handleOutsideClick = (e: MouseEvent) => { // Listens to mouse event
    // Checks if this is mobile view, sidebar is open, and if the tap target is not sidebar, close sidebar
    // '!(e.target as HTMLElement).closest('.sidebar')' - Not sidebar
    if (isMobile && isOpen && !(e.target as HTMLElement).closest('.sidebar')) {
      setIsOpen(false) // Close sidebar
    }
  }

  useEffect(() => {
    // On mobile and sidebar is open
    if (isMobile && isOpen) {
      // Add the event listener to handle clicking outside the sidebar
      document.addEventListener('click', handleOutsideClick)
    }
    // Remove the event listener on unmount to prevent memory leaks
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [isMobile, isOpen]) // Only change if on mobile, and sidebar is open


  // ------------ Render a group of navigation items ------------
  // Each group has
  // - A small floating title label ('Admin' or 'User')
  // - Card containing the nav items
  // - Items can be links or expandable dropdowns 
  const renderGroup = (title: string, items: typeof adminModules) => (
    <div className="relative mb-6">
      {/* Group title label - positioned absolute so it floats above card border */}
      <span className="absolute -top-2 left-4 bg-white px-2 text-gray-700 text-xs font-semibold uppercase tracking-wide z-10">
        {title}
      </span>

      {/* Sidebar items with dropdown sections */}
      <div className="bg-white shadow-sm rounded-lg p-3">
        <nav className="space-y-1">
          {items.map((item) => (
            <div key={item.name}>

              {/* ---------- Direct links with no dropdown section ----------- */}
              {item.dropdown ? null : (
                <Link
                // Link for the sidebar item
                  href={item.href}
                  onMouseEnter={() => setHoveredItem(item.name)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`flex items-center w-full p-2 rounded-md whitespace-nowrap ${pathname === item.href
                    ? 'bg-red-600 text-white shadow-md' // Active page - shows the sidebar item in red
                    : hoveredItem === item.name
                      ? 'bg-red-50 text-red-600'  // Hovering over - shows the sidebar item in light red
                      : 'text-black-700 hover:bg-red-50 hover:text-red-600'
                    }`}
                >
                  {/* Item icon */}
                  <item.icon className="h-5 w-5 mr-3 flex-shrink-0" />
                  {/* Item name */}
                  {item.name}
                </Link>
              )}

              {/* ---------- Sidebar items with dropdown toggle button ---------- */}
              {item.dropdown && (
                <button
                  onClick={() => toggleDropdown(item.href)}
                  onMouseEnter={() => setHoveredItem(item.name)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`flex items-center w-full p-2 rounded-md whitespace-nowrap ${pathname.startsWith(item.href) // On a page that is under this sidebar item section
                    ? 'bg-red-600 text-white shadow-md' // The parent sidebar item in red
                    : hoveredItem === item.name
                      ? 'bg-red-50 text-red-600'
                      : 'text-black-700 hover:bg-red-50 hover:text-red-600'
                    }`}
                >
                  {/* Item icon */}
                  <item.icon className="h-5 w-5 mr-3 flex-shrink-0" />
                  {/* Item name */}
                  {item.name}

                  {/* Dropdown toggle arrow icon */}
                  <ChevronDownIcon className={`h-5 w-5 ml-auto transition-transform duration-200 ${activeItem === item.href ? 'rotate-180' : '' }`}
                  />
                </button>
              )}

              {/* -------------- Dropdown menu contents ------------- */}
              {/* Show this content if menu has sub-items, and the dropdown is currently expanded */}
              {item.dropdown && activeItem === item.href && (
                <div className="ml-8 space-y-1 mt-1">
                  {/* For each sub-item, create a link */}
                  {item.dropdown.map((subItem) => (
                    <Link
                      key={subItem.path}
                      // Build the URL by combining parent + child path
                      // item.href = /admin/AssetTracking
                      // subItem.path = assets
                      // Final URL = /admin/assetTracking/assets
                      href={`${item.href}/${subItem.path}`}
                      className={`block p-2 text-sm rounded ${pathname === `${item.href}/${subItem.path}` 
                        ? 'text-red-600 bg-red-50 font-medium' // If we are on this page
                        : 'text-black-600 hover:text-red-600 hover:bg-red-50' // If we are not on this page
                        }`}
                    >
                      {/* Sub-item's label */}
                      {subItem.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
    </div>
  )

  // ------------- Rendering the main component ------------
  return (
    <>
      {isOpen && (
        <div 
          className={`sidebar bg-white shadow-lg flex flex-col z-40 
            ${isMobile
              ? 'fixed top-0 left-0 w-full p-4 pt-6' // Mobile - opens sidebar from the top
              : 'min-h-screen w-64 p-4 fixed left-0' // Desktop - open sidebar and fixed on left panel
            }
          `}
            
          style={{
            // Prevents the sidebar from extending beyond the viewport height
            // 100vh - 4 rem leaves space for navbar at the top
            maxHeight: isMobile ? 'calc(100vh - 2rem)' : 'calc(100vh - 4rem)',
            overflowY: 'auto' // Scroll if the content is taller than the viewport
          }}
            >

          <div className="flex-1">
            {/* Commented by Desmond @ 20-April-26 - Hidden 'X' button and some reasoning */}
            {/* Well, you can't view the 'X' button on mobile, but I don't dare to remove this section for now */}
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              {/* Placeholder text that I also don't dare to remove as it would screw up the layout */}
              <span className="text-xl font-bold invisible">Placeholder</span>
              {isMobile && (
                <button onClick={() => setIsOpen(false)} className="text-red-600 hover:text-red-800">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            {/* End of the weird hidden 'X' button section */}

            {/* Search bar - currently the feature is not yet implemented to search through items in the sidebar */}
            {/*
              TODO: This search input bar is current a visual placeholder.
              Implement filtering through adminModules or userModules by name when value changes
              and show sidebar items that match the letters as the user key in the input. 
             */}
            {isMobile && (
              <div className="relative mb-6">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600 w-full"
                />
              </div>
            )}

            {/* Desmond, 1 Nov 25 : Start of adding user role-based module rendering */}
            {/* Admin sees both modules */}
            {userRole === 'admin' && (
              <>
                {renderGroup('Admin', adminModules)}
                {/* {renderGroup('Staff', staffModules)} */}
              </>
            )}

            {/* Regular users see only the User module */}
            {userRole !== 'admin' && renderGroup('Staff', staffModules)}
            {/* Desmond, 1 Nov 25 : End */}
          </div>

          {/* ---------------- Bottom section: Settings + Sign Out ---------------- */}
          {/* border-t creates a line separator from the sidebar items above */}

          {/* ----------- Settings ---------- */}
          <div className="border-t border-gray-200 pt-4 space-y-2">

            {/* ---------- Logout button component ---------- */}
            <LogoutButton
              className={`flex items-center w-full p-3 rounded-lg ${pathname === '/logout'
                ? 'bg-red-600 text-white shadow-md'
                : hoveredItem === 'Log Out'
                  ? 'bg-red-50 text-red-600'
                  : 'text-black-700 hover:bg-red-50 hover:text-red-600'
                }`}
              showIcon={true}
              text="Sign Out"
            />
          </div>
        </div>
      )}
    </>
  )
}