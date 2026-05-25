"use client"

import { useSession, signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { useToast } from '@/components/ui/toast'

export default function LoginClient() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { showToast } = useToast()
  const hasRedirected = useRef(false)

  // Redirect the user after login successfully
  useEffect(() => {
    // Prevents the user from redirected multiple times
    if (hasRedirected.current) {
      return
    }

    if (status !== 'authenticated' || !session?.user) {
      return
    }

    // Redirect the user to their respective dashboard if authenticated
    if (status === 'authenticated' && session?.user) {
      hasRedirected.current = true
      // Get the user role from the session
      const role = (session.user as any).role

      // Handle different account statuses
      if (role === 'pending') {
        showToast("Your account is pending admin approval", "warning")
        return
      } else if (role == 'rejected') {
        showToast("Your account has been rejected", "error")
        return
      } else if (role === 'unregistered') {
        showToast("Your account is not registered in the system. Please register for access", "warning")
        return
      }

      // Store login success in sessionStorage so that toast can display
      sessionStorage.setItem('loginSuccess', 'true')
      // console.log("Set loginsuccess in sessionstorage")

      // Redirect based on role after a short delay
      if (role == 'admin') {
        router.replace("/admin/dashboard")
      } else {
        router.replace("/user/dashboard")
      }
    }
  }, [status, session, router, showToast])

  if (status === 'loading') {
    return <LoadingState />
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-6">
            <img
              src="/logo-long-full.svg"
              alt="Swinburne University of Technology"
              className="h-15 w-auto"
            />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Asset Tracking System
          </h1>
          <p className="text-gray-600 text-sm">IT Asset Management</p>
        </div>

        {/* Microsoft Login */}
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Sign in with your organization account
            </p>
          </div>

          <button
            onClick={() => {
              // Commented by Desmond @ 12-May-26: Extract the callback URL from the query parameters
              // to preserve the original destination after login
              // Suppose the user tries to access /scan/location/E404 but they are not logged in, which 
              // they will be redirected to /login?callbackUrl=/scan/location/E404. 
              // After successful login, we want to redirect them back to /scan/location/E404, 
              // not the default dashboard. 
              const callbackUrl = new URLSearchParams(window.location.search).get('callbackUrl')

              // Initiate Microsoft login with the callback URL if it exists. Otherwise, it will 
              // default to the dashboard redirection in the auth callback.
              signIn('azure-ad', {
                callbackUrl: callbackUrl || undefined
              })
            }}
            
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors font-medium disabled:opacity-50"
            disabled={false}
          >
            <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 0H0V10H10V0Z" fill="#F25022" />
              <path d="M21 0H11V10H21V0Z" fill="#7FBA00" />
              <path d="M10 11H0V21H10V11Z" fill="#00A4EF" />
              <path d="M21 11H11V21H21V11Z" fill="#FFB900" />
            </svg>Sign in with Microsoft
          </button>

          {/* Registration Link */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-600 mb-3">
              Register and wait for account approval from the admin
            </p>
            <a
              href="/register"
              className="block w-full text-center px-4 py-2 border border-red-600 text-red-600 rounded-md hover:bg-red-50 transition-colors font-medium"
            >
              Register for Access
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  )
}