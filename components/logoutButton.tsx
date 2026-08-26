// components\logoutButton.tsx
'use client'
/** Commented by Desmond @ 22-April-26
 * @file logoutButton.tsx
 * @description A reusable Sign Out button with a confirmation modal.
 * 
 * Used in the navbar profile dropdown menu and the sidebar footer
 * When clicked, it shows a confirmation modal before signout out
 * to prevent accidental sign outs.
 */

import { signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
// Commented by Desmond @ 22-April-26
// Previously, there is an issue where the logout confirmation modal wouldn't block the screen
// properly or left the navbar visible.
// This is because the logout button is under its parents' (navbar or sidebar) z-index which
// is 40 or 50. This creates an issue where no matter how high the z-index of logout button we put,
// the logout button still cannot be on top of the screen because it is bounded by the z-index
// of the parent component.

// Therefore, createPortal is used to break free the modal DOM from the <body> and place
// it outside the sidebar CSS's constraints and put the logout confirmation modal at the 
// very top of the screen and put a background on the rest of the page component.
import { createPortal } from 'react-dom'

// -------------- Props for the LogoutButton component ------------------
interface LogoutButtonProps {
  // Tailwind class for the trigger button which is passed from navbar or sidebar
  className?: string
  // whether to render the logout arrow icon beside the text label
  showIcon?:boolean
  // Button label text
  text?: string
}

// ---------------- Export the main logout button component -----------------
export default function LogoutButton({className = '', text = 'Log Out'}: LogoutButtonProps) {
  // Whether the confirmation modal is currently visible
  const [showConfirmation, setShowConfirmation] = useState(false)

  // True while the async signout sequence is in progress
  // It will disable the confirm button to prevent double-clicks
  const [signingOut, setSigningOut] = useState(false)

  // ----------------- Escape key handler -----------------
  // Used to close the logout confirmation modal by pressing the ESC key
  useEffect(() => {
    // If the confirmation modal is not open, return nothing
    if (!showConfirmation) {
      return
    }

    // Create the event listener for listening for ESCAPE key keydown
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Cancel logout when ESC pressed
        cancelLogout()
      }
    }

    // Add the event listener to the page
    document.addEventListener('keydown', handleEscape)
    // Cleanup the event listener to prevent memory leaks
    return () => document.removeEventListener('keydown', handleEscape)
  }, [showConfirmation]) // Only update when the showConfirmation model triggers or updates

  // -------------------- Event handlers ----------------------
  // ---------- Open the logout confirmation modal --------
  const handleLogout = () => {
    setShowConfirmation(true)
  }

  // ---------- Perform the sign out sequence ----------
  // 1. It clears the 'lastPath' from sessionStorage so the welcome toast shows
  //    on next login
  // 2. POST /api/sessions/end to record the session end in the database
  // 3. Call next-auth's signOut() which clears the cookie and redirect user to /login
  // The API call is best-effort so even if it fails, we still sign out using next-auth
  // Moreover, the user should never be stuck on the app because the DB call failed
const confirmLogout = async () => {
    setSigningOut(true)
    try {
      try {
        sessionStorage.removeItem('lastPath')
        localStorage.removeItem('userSession')
      } catch {
        // non-fatal
      }

      // Step 1: Clear your custom cookie/session via your own API
      const logout = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      })

      if (!logout.ok) {
        throw new Error(`Logout failed with status ${logout.status}`)
      }

      // Step 2: Let NextAuth clear its own session/CSRF/callback cookies correctly
      await signOut({ redirect: false })

      // Step 3: Clear Microsoft's SSO session too, then land on /login
      window.location.href =
        "https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=" +
        encodeURIComponent(window.location.origin + "/login")

    } catch (error) {
      console.error('Logout failed:', error)
      // Fallback: still try to clear NextAuth session and go to Microsoft logout
      try {
        await signOut({ redirect: false })
      } catch {
        // ignore
      }
      window.location.href =
        "https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=" +
        encodeURIComponent(window.location.origin + "/login")
    } finally {
      setSigningOut(false)
    }
  }

  // --------- Close the logout confirmation modal -------------
  const cancelLogout = () => {
    setShowConfirmation(false)
  }

  // ------------------ Render the main logout confirmation modal ---------------------
  return (
    <>
      {/* ------------ Trigger button ------------ */}
      <button 
        onClick={handleLogout} 
        className={className} 
        type="button" 
        aria-label={text}
      >
        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3 flex-shrink-0" aria-hidden="true" /> {/* Icon is decorative — label text provides the meaning */}
        {text}
      </button>

      {/* -------------- Confirmation model ------------ */}
      {/* 
        * When logout button is pressed so showConfirmation is true 
        * It is also rendered as a portal-like overlay covering the full screen
        * z-[9999] ensures it stays at the very top above the navbar (z-50) and sidebar (z-40) 
      */}
      {showConfirmation && createPortal (
        <div 
          data-portal-root="true" // <--- This tells the Navbar "don't close me"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
          onClick={cancelLogout}
          aria-hidden="false"
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
          >
            {/* ---- Confirm logout title ----- */}
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Confirm Logout
            </h3>

            {/* ----- Ask to confirm logout ------  */}
            <p className="text-gray-600 mb-6">Are you sure you want to log out?</p>

            <div className="flex space-x-3">
              {/* ------ Cancel button -------- */}
              <button
                onClick={cancelLogout}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-md transition-colors"
              >
                Cancel
              </button>

              {/* ------- Confirm logout button ------- */}
              <button
                onClick={confirmLogout}
                disabled={signingOut}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Text changes when signing out */}
                {signingOut ? 'Signing out...' : 'Log Out' }
              </button>

            </div>
          </div>
        </div>, document.body // createPortal() requires two parameters
      )}
    </>
  )
}