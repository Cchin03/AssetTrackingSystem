// app/api/auth/logout/route.ts

/** Commented by Desmond 2-May-26
 * @file app/api/auth/logout/route.ts
 * @description Secure logout endpoint following OAuth2 best practices
 * 
 * Commented by Desmond @ 16-May-26: LATEST CHANGES
 * Fix
 *  - The previous version only cleared 'next-auth.session-token'. On Vercel
 *    (HTTPS/production) NextAuth uses the '__Secure-' prefixed cookie name.
 *    Therefore, clearing only the un-prefixed name left the KWT alive on the client.
 *    The middleware authorized() callback then still returned true, the logout page
 *    is re-mounted, signOut() fired again, and the cycle repeats into an infinite loop.
 * 
 * - Clears NextAuth session and cookies
 * - Clears the custom user_session_cookie
 * - Returns success response for client to handle redirect
 * - Uses HTTP 200 OK (client controls the redirect and not the server)
 * 
 * Security notes:
 * - Server-side JWT/session clearing (cannot be forged by client)
 * - Client-side router.replace prevents back-button navigation
 * - All sensitive data cleared before redirect
 */

// NextResponse to build HTTP responses
// NextRequest to accept incoming request objects
import { NextRequest, NextResponse } from 'next/server'

// --------------------------------------------------------------
//                     POST /api/auth/logout
// --------------------------------------------------------------
// _request: NextRequest represents the incoming HTTP request but
// currently acting as a placeholder
// _ in front of 'request' is to let the build tool know that we understand
// this parameter is not being used, but ignore it for now to prevent
// build errors
export async function POST(_request: NextRequest) {
    try {
        // Clear the custom user_session cookie
        // Create a JSON response first but do not send it
        const response = NextResponse.json({
            success: true,
            message: 'Logged out successfully',
            redirectTo: '/login'
        })

        // Clear the user_session cookie (matches /api/sessions/end)
        // Set the cookie value to empty and deletes the cookie immediately
        // Hence, maxAge: 0
        // It deletes the cookie named 'user_session' and set the cookie value to
        // '' (empty)

        // response.cookie.set(name, value, options)
        // name: Cookie key
        // value: Cookie value
        // options: Configurations (security, expiry and scope)
        response.cookies.set('user_session', '', {
            // Cookie cannot be accessed via JavaScript
            // To protect against XSS (Cross-site scripting)
            httpOnly: true, 
            // Cookie is sent over only HTTPS (in production)
            secure: process.env.NODE_ENV === 'production',
            // strict, lax and none
            // strict: Only allow same-site requests
            // lax: Safe balance
            // none: Allows cross-site (requires secure)

            // If a logout cookie were set to 'strict', the browser would not send
            // it if the user clicked a 'Logout' link from a different site (like a 
            // support portal or partner site)
            // The user would land on the logout page, but because the session cookie
            // wasn't sent, the server wouldn't know who they are, and the logout
            // would fail
            sameSite: 'lax',
            // Browser deletes the cookie immediately
            maxAge: 0,
            // Cookie is valid for the entire site
            path: '/'
        })

        // For NextAuth, also need to clear the NextAuth session cookie
        // next-auth.session-token is NextAuth's core session cookie
        response.cookies.set('next-auth.session-token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        // NextAuth JWT cookie name in production (HTTPS)
        // NextAuth automatically switches to the __Secure- prefix when the request
        // arrives over HTTPS. We must clear both names so that the JWT is destroyed
        // regardless of which environment the request originated from
        response.cookies.set('__Secure-next-auth.session-token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        // Clear callback URL cookie if it exists
        // It deletes the stored 'callback URL' used by NextAuth to redirect the 
        // user after login or logout
        // A callback URL is the URL the application redirects the user to 
        // after an authentication action completes (e.g. login, logout)
        response.cookies.set('next-auth.callback-url', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        // Return the response
        return response
    // Catch the errors
    } catch (error) {
        // Log the error to console for developers
        console.error('Logout error:', error)
        // Even if an error occurred, still clear the cookies and allow user to logout
        const response = NextResponse.json(
            {
                success: true,
                message: 'Logged out',
                redirectTo: '/login'
            }, 
            { 
                status: 200 
            }
        )

        // Clear the user_session cookie 
        response.cookies.set('user_session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        // For NextAuth, also need to clear the NextAuth session cookie
        // next-auth.session-token is NextAuth's core session cookie
        response.cookies.set('next-auth.session-token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        // NextAuth JWT cookie name in production (HTTPS)
        // NextAuth automatically switches to the __Secure- prefix when the request
        // arrives over HTTPS. We must clear both names so that the JWT is destroyed
        // regardless of which environment the request originated from
        response.cookies.set('__Secure-next-auth.session-token', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
         })

        // Clear callback URL cookie if it exists
        // It deletes the stored 'callback URL' used by NextAuth to redirect the 
        // user after login or logout
        // A callback URL is the URL the application redirects the user to 
        // after an authentication action completes (e.g. login, logout)
        response.cookies.set('next-auth.callback-url', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        // Return the response
        return response
    }
}
