'use client'

// useAuth - checks if the user is logged in, redirect to /login if not
import { useAuth } from '@/hooks/useAuth'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
// import { useRouter } from 'next/navigation'
import Breadcrumb from '@/components/ui/breadcrumb'

export default function ProfilePage() {
  // const router = useRouter()

  // Ensures only authenticated users can view this page
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth()

  const { data: session, status } = useSession()
  const [assignedAssets, setAssignedAssets] = useState<any[]>([])
  const [isLoadingAssets, setIsLoadingAssets] = useState(true)
  const [showAllAssets, setShowAllAssets] = useState(false)
  // const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  // const [isProfileOpen, setIsProfileOpen] = useState(false)
  // const [activeItem, setActiveItem] = useState<string | null>('/profile')
  // const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  // const [isTopBarVisible, setIsTopBarVisible] = useState(true)
  // const [lastScrollY, setLastScrollY] = useState(0)
  // const [isMobile, setIsMobile] = useState(false)

  // Fetch assigned assets when session is available
  useEffect(() => {
    const fetchAssets = async () => {
      const staffId = (session?.user as any)?.staffId
      if (!staffId) {
        setIsLoadingAssets(false)
        return
      }

      try {
        const response = await fetch('/api/staff/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ staffId })
        })

        const data = await response.json()

        if (data.success) {
          setAssignedAssets(data.assets || [])
        }
      } catch (error) {
        console.error('Error fetching assets:', error)
      } finally {
        setIsLoadingAssets(false)
      }
    }

    fetchAssets()
  }, [session])

  // Show nothing while checking session, or if user is not logged in (useAuth will redirect to /login)
  if (isAuthLoading || !isAuthenticated) return null

  // show all assets or just first 3 depending on showAllAssets state
  const displayAssets = showAllAssets ? assignedAssets : assignedAssets.slice(0, 3)
  const hasMoreAssets = assignedAssets.length > 3
  const breadcrumbItems = [
    { label: 'Home', href: '/admin/dashboard', isClickable: true },
    { label: 'Profile', href: '/profile', isClickable: true }
  ]

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 antialiased">
      <main className="p-6">
        <div className="max-w-6xl mx-auto">
          {/* Add Breadcrumb component */}
          <Breadcrumb customItems={breadcrumbItems} />

          {/* Profile Card */}
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">User Profile</h1>
              <div className="h-1 w-20 bg-red-600 rounded"></div>
            </div>

            {/* User Information */}
            <div className="space-y-4">
              {/* User Name */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                <label className="text-sm font-semibold text-gray-700 w-full sm:w-40 mb-1 sm:mb-0">
                  User Name:
                </label>
                <div className="text-gray-900 bg-gray-50 px-4 py-2 rounded-md flex-1">
                  {status === 'loading' ? 'Loading...' : session?.user?.name || 'N/A'}
                </div>
              </div>

              {/* Email */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                <label className="text-sm font-semibold text-gray-700 w-full sm:w-40 mb-1 sm:mb-0">
                  Email:
                </label>
                <div className="text-gray-900 bg-gray-50 px-4 py-2 rounded-md flex-1">
                  {status === 'loading' ? 'Loading...' : session?.user?.email || 'N/A'}
                </div>
              </div>

              {/* User ID */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                <label className="text-sm font-semibold text-gray-700 w-full sm:w-40 mb-1 sm:mb-0">
                  Staff ID:
                </label>
                <div className="text-gray-900 bg-gray-50 px-4 py-2 rounded-md flex-1">
                  {status === 'loading' ? 'Loading...' : session?.user?.staffId || 'N/A'}
                </div>
              </div>

              {/* Mobile Number */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                <label className="text-sm font-semibold text-gray-700 w-full sm:w-40 mb-1 sm:mb-0">
                  Mobile:
                </label>
                <div className="text-gray-900 bg-gray-50 px-4 py-2 rounded-md flex-1">
                  {status === 'loading' ? 'Loading...' : session?.user?.mobileNo || 'N/A'}
                </div>
              </div>

              {/* Department */}
              <div className="flex flex-col sm:flex-row sm:items-center">
                <label className="text-sm font-semibold text-gray-700 w-full sm:w-40 mb-1 sm:mb-0">
                  Department:
                </label>
                <div className="text-gray-900 bg-gray-50 px-4 py-2 rounded-md flex-1">
                  {status === 'loading' ? 'Loading...' : session?.user?.departmentId || 'N/A'}
                </div>
              </div>

              {/* Assigned Assets */}
              <div className="pt-4">
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  Assigned Assets:
                </label>
                <div className="space-y-3">
                  {isLoadingAssets ? (
                    <div className="text-center py-8 text-gray-500">
                      Loading assets...
                    </div>
                  ) : displayAssets.length > 0 ? (
                    <>
                      {displayAssets.map((assignment: any) => (
                        <div
                          key={assignment.id}
                          className="bg-white border-2 border-gray-300 rounded-full px-4 py-3 flex items-center justify-between hover:border-red-400 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {assignment.asset?.name || 'Unknown Asset'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {assignment.asset?.asset_id || assignment.asset_id} • {assignment.asset?.category || 'N/A'}
                            </p>
                          </div>
                        </div>
                      ))}

                      {/* toggle show all / collapse */}
                      {hasMoreAssets && (
                        <button
                          onClick={() => setShowAllAssets(!showAllAssets)}
                          className="w-full bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-3 flex items-center justify-center space-x-2 transition-colors"
                        >
                          <span className="text-lg font-semibold">{showAllAssets ? '−' : '+'}</span>
                          <span className="text-sm font-medium">
                            {showAllAssets ? 'Show Less' : `View All Assets (${assignedAssets.length})`}
                          </span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No assets assigned yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}