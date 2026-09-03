# Asset Tracking System 
IT Asset Tracking System with QR Codes and Microsoft Authentication for Group 15, Swinburne University
https://asset-tracking-system-oj79.vercel.app/login

## Tech Stack
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Authentication**: NextAuth.js with Microsoft Azure AD
- **Database**: Supabase (PostgreSQL)
- **UI Components**: Heroicons, Lucide React, Framer Motion

## Prerequisites

Before you begin, ensure you have:
- Node.js 18+ installed
- npm or yarn package manager
- Microsoft Azure AD app registration (for authentication)
- Supabase project (for database)

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd AssetTrackingSystem
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**

Create a `.env.local` file in the root directory with the following variables:

```env
# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-with-openssl-rand-base64-32>

# Microsoft Azure AD Provider
AZURE_AD_CLIENT_ID=<your-azure-client-id>
AZURE_AD_CLIENT_SECRET=<your-azure-client-secret>
AZURE_AD_TENANT_ID=<your-azure-tenant-id>

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

**To generate NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

4. **Configure Azure AD**
   - Go to Azure Portal → App Registrations
   - Create or select your app registration
   - Add redirect URI: `http://localhost:3000/api/auth/callback/azure-ad`
   - Create a client secret in "Certificates & secrets"
   - Ensure API permissions include: `User.Read`, `openid`, `profile`, `email`

5. **Set up Supabase**
   - Create a Supabase project
   - Run the database migrations (if provided)
   - Get your project URL and anon key from Project Settings

## Development

Start the development server:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Mobile Testing with ngrok

For testing the application on mobile devices or sharing with teammates, use ngrok to create a public URL that tunnels to your localhost.

### Prerequisites

1. **Download ngrok**: https://ngrok.com/download
2. **Sign up** for a free ngrok account: https://dashboard.ngrok.com/signup
3. **Get your authtoken**: https://dashboard.ngrok.com/get-started/your-authtoken

### Setup (One-time)

1. **Extract ngrok.exe** to the project folder:
   ```
   D:\COS40005\FYP\AssetTracking\ngrok.exe
   ```

2. **Authenticate ngrok** (replace with your actual token):
   ```bash
   ./ngrok.exe config add-authtoken YOUR_AUTHTOKEN_HERE
   ```

### Running ngrok

1. **Start your dev server** (in one terminal):
   ```bash
   npm run dev
   ```

2. **Start ngrok** (in a separate terminal):
   ```bash
   ./ngrok.exe http 3000
   ```

3. **Copy the URL** from the ngrok output. It will look like:
   ```
   Forwarding: https://abc-def-ghi.ngrok-free.dev -> http://localhost:3000
   ```

### Configuration

#### 1. Update `.env.local`:

Change the `NEXTAUTH_URL` to your ngrok URL:

```env
# BEFORE (for localhost testing)
NEXTAUTH_URL=http://localhost:3000

# AFTER (for mobile/ngrok testing)
NEXTAUTH_URL=https://abc-def-ghi.ngrok-free.dev
```

**⚠️ IMPORTANT**: Remember to change it back to `localhost:3000` when done with mobile testing!

#### 2. Add Redirect URI to Azure AD:

1. Go to **Azure Portal** → **App Registrations**
2. Select your app
3. Go to **Authentication**
4. Under **Redirect URIs**, click **"+ Add a URI"**
5. Add: `https://abc-def-ghi.ngrok-free.dev/api/auth/callback/azure-ad`
6. Click **Save**

#### 3. Restart your dev server:

```bash
# Stop the server (Ctrl + C)
npm run dev
```

### Testing

- **On your phone**: Open `https://abc-def-ghi.ngrok-free.dev`
- **Share with teammates**: Send them the ngrok URL
- **Everyone sees your localhost**: Any code changes you make will be visible to everyone through the ngrok URL

### Important Notes

✅ **ngrok keeps running** - Don't close the ngrok terminal window
✅ **URL stays the same** - As long as ngrok is running, the URL doesn't change
❌ **URL changes when you restart ngrok** - You'll need to update `.env.local` and Azure AD again
✅ **Works from anywhere** - Teammates don't need to be on the same WiFi
⚠️ **Your computer must be on** - For teammates to access the URL

### Stopping ngrok

When done with mobile testing:

1. **Stop ngrok**: Press `Ctrl + C` in the ngrok terminal
2. **Revert `.env.local`** back to:
   ```env
   NEXTAUTH_URL=http://localhost:3000
   ```
3. **Restart dev server**: `npm run dev`
4. **(Optional) Remove ngrok URL from Azure AD** if you won't use it for a while

### For Normal Development (Without Mobile Testing)

Just use `localhost:3000` - you don't need ngrok at all! Only use ngrok when you specifically need to test on mobile devices or share with remote teammates.

## Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
app/                    # Next.js App Router pages
├── api/               # API routes
├── admin/             # Admin pages (dashboard, assets, etc.)
├── profile/           # User profile page
└── page.tsx           # Login page

components/            # React components
├── auth/              # Authentication components
├── LogoutButton.tsx   # Logout component
└── SessionProvider.tsx # Custom session management

lib/                   # Utility libraries
├── supabase.ts        # Supabase client configuration

types/                 # TypeScript type definitions
└── next-auth.d.ts     # NextAuth type extensions
```

## Key Features

- Microsoft Azure AD authentication via NextAuth.js
- Custom session management with Supabase
- Role-based access control (Admin/User)
- Asset management (CRUD operations)
- QR code scanning for assets
- Staff management
- Department and location tracking
- PDF export functionality
- Responsive mobile-first design

## Authentication Flow

1. User clicks "Sign in with Microsoft" on login page
2. NextAuth redirects to Microsoft login
3. After successful authentication, app fetches staff data from Supabase using Microsoft User ID
4. Session is created in database and stored locally
5. User is redirected to dashboard

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXTAUTH_URL` | Application URL | Yes |
| `NEXTAUTH_SECRET` | Secret for JWT encryption | Yes |
| `AZURE_AD_CLIENT_ID` | Azure AD application ID | Yes |
| `AZURE_AD_CLIENT_SECRET` | Azure AD client secret | Yes |
| `AZURE_AD_TENANT_ID` | Azure AD tenant/directory ID | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |

## Troubleshooting

**Authentication not working?**
- Verify Azure AD redirect URI is correctly configured
- Check that client secret is valid and not expired
- Ensure all required API permissions are granted in Azure

**Database connection issues?**
- Verify Supabase URL and anon key are correct
- Check if Supabase project is active
- Test connection at `/api/test-connection`

**Session not persisting?**
- Clear browser localStorage
- Check if cookies are enabled
- Verify NEXTAUTH_SECRET is set

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

# security 
npm install @azure/msal-react @azure/msal-browser

# Realtime chart
npm install recharts

## Contributing

This is a university project for Group 15. Please follow the existing code style and conventions.

## License

This project is for educational purposes as part of Swinburne University's Final Year Project.
