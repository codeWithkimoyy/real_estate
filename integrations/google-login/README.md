# Google Login Integration Scaffold

This folder contains a starter structure for Google (Gmail) login integration.

## Structure

- frontend/GoogleLoginButton.tsx: React button component using Google Identity Services.
- backend/google-auth.php: Backend endpoint template for verifying Google ID tokens.
- backend/google-auth-config.example.php: Example config for client IDs and settings.

## High-Level Flow

1. Frontend renders Google sign-in button and receives an ID token.
2. Frontend posts the token to backend endpoint (`/api/google-auth.php` once integrated).
3. Backend verifies token with Google and resolves user profile.
4. Backend creates or matches local user account.
5. Backend issues app session token and returns standard auth payload.

## Setup Notes

- Add your web client ID to frontend and backend config.
- Restrict authorized JavaScript origins in Google Cloud Console.
- Add CSRF/state validation if you switch to auth-code flow.
- Keep this scaffold separate until you wire it into existing login/register pages.

## Next Integration Targets in Current Project

- Frontend auth layer: src/lib/auth.ts
- Login page UI: src/pages/LoginPage.tsx
- Backend auth routes: api/auth.php (or dedicated api/google-auth.php)
