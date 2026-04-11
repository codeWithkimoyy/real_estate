# EstateFlow Project Overview

## 1) Project Summary
EstateFlow is a full-stack real estate platform with a React + TypeScript frontend and a PHP + MySQL backend.

It supports:
- Public property browsing and search
- Account registration/login with role-aware access
- Buyer/seller/agent/clerk/admin dashboards
- Inquiries, favorites, appointments, payments, reservations, and disputes
- Admin operations: user management, audit logs, system controls

## 2) Tech Stack

### Frontend
- React 19
- TypeScript
- React Router
- Tailwind-based utility styling
- GSAP animations
- Vite for local dev/build tooling

Key entry files:
- src/main.tsx
- src/App.tsx
- src/components/Navigation.tsx
- src/components/ProtectedRoute.tsx

### Backend
- PHP 8.x (resource-oriented API files)
- MySQL (InnoDB)
- Shared helper/security/auth utilities in `api/helpers.php`

Key backend files:
- api/auth.php
- api/helpers.php
- api/config.php
- api/db.php

### Build/Serve
- Dev: Vite server
- Production-style local serve: Apache/Wamp serving built `dist/` assets via `.htaccess`

## 3) Frontend Architecture

### Routing and Shell
The app is routed in `src/App.tsx` using React Router:
- Public routes: `/`, `/listings`, `/property/:id`, `/agents`, `/sell`
- Auth routes: `/login`, `/register`
- Protected route: `/dashboard` guarded by `ProtectedRoute`

`Navigation` is hidden on auth pages and simplified on dashboard pages.

### Authentication State
Auth state is managed in `src/lib/auth.ts`:
- Stores session data in localStorage under `estateflow_auth`
- Emits a custom `estateflow-auth-changed` event
- Supports login, register, logout, refresh token, forgot/reset password

### API Client Layer
`src/lib/api.ts` centralizes API requests:
- Uses a base API URL (`VITE_API_BASE_URL` or localhost fallback)
- Adds bearer auth header automatically
- Provides typed functions for all modules (properties, users, inquiries, etc.)
- Includes safer response parsing to catch non-JSON server responses

### RBAC (Role-Based Access Control)
`src/lib/rbac.ts` defines:
- Roles: administrator, agent, seller, buyer, clerk
- Permission map per role
- Helper checks used by routes/navigation/dashboard tabs

### Domain Types
`src/data/philippineData.ts` contains shared frontend interfaces for:
- Property, Agent, Inquiry, Appointment, Payment, Reservation, Notification, Dispute, etc.

## 4) Dashboard Design

`src/pages/DashboardPage.tsx` is a role-adaptive dashboard shell.

Role-specific tab sets:
- Buyer: favorites, reservations, inquiries, appointments, payments, profile
- Clerk: appointments, inquiries, payments, reservations, user verification, profile
- Admin: approvals, all listings, users, analytics, audit logs, system, and more
- Seller/Agent: listings + communication + finance views

Dashboard behavior includes:
- Sidebar notification dots from API counts
- Mobile responsive sidebar/drawer
- Panel-level loading skeletons and empty states

## 5) Backend API Structure

API files under `api/` follow a resource-per-endpoint pattern:
- `properties.php`
- `users.php`
- `inquiries.php`
- `appointments.php`
- `payments.php`
- `reservations.php`
- `disputes.php`
- `notifications.php`
- `audit-logs.php`
- ...plus supporting endpoints

### Shared Security and Utility Layer
`api/helpers.php` provides:
- Security headers (CSP, X-Frame-Options, etc.)
- CORS handling
- JSON response helper
- Input parsing and token extraction
- Rate limiting (DB-backed)
- Session lifecycle helpers (create/validate/rotate/destroy)
- Auth/role guard helpers
- Audit logging and notification helpers

### Auth Endpoint
`api/auth.php` supports action-based operations via POST payload:
- register
- login
- me
- refresh
- logout
- logout_all
- forgot_password
- reset_password
- verify_email
- request_email_verification

## 6) Data Model and Migrations

### Base Schema
`database/schema.sql` defines foundational tables:
- users
- properties
- inquiries
- favorites
- appointments
- neighborhoods
- testimonials
- market_insights
- audit_logs

### v2 Migration
`database/migration_v2.sql` adds major platform/security features:
- sessions (hashed session tokens)
- rate_limits
- notifications
- verification_history
- password_resets
- email_verifications
- disputes
- property_images, amenities, property_amenities
- soft-delete and verification columns/indexes on existing tables

Important: backend code expects v2-era fields/tables, so schema + migration alignment is required.

## 7) Runtime and Deployment Modes

### Development Mode
- Run frontend using Vite (`npm run dev`)
- API served from Apache/PHP endpoint base URL

### Wamp/Apache Mode (No Vite runtime requirement)
- Build frontend (`npm run build`)
- Apache serves the app through root `.htaccess`
- Root route and SPA fallback point to `dist/index.html`
- Assets/images are remapped to `dist/` paths
- API/database script directories remain direct Apache paths

## 8) Current Strengths
- Clear separation of frontend and backend concerns
- Centralized typed API consumption on frontend
- Role and permission model applied in UI and backend
- Better-than-basic backend security posture for a PHP monolith
- Broad business coverage beyond simple listings

## 9) Known Operational Notes
- If frontend shows JSON parse errors (for example, unexpected `<`), backend likely returned HTML due to PHP/DB runtime errors.
- Ensure DB schema is fully migrated (including v2-required auth/rate-limit/session structures).
- Keep `dist/` rebuilt after frontend changes when serving through Apache.

## 10) Suggested Next Improvements
1. Add automated API integration tests for auth and role-based endpoints.
2. Add DB migration tracking/versioning execution script to avoid drift.
3. Introduce centralized backend error handler with consistent JSON envelope.
4. Add OpenAPI/Swagger-style endpoint docs for easier client integration.
5. Split dashboard panels into smaller feature modules for maintainability.

## 11) User Roles and Access Snapshot

### Administrator
Core responsibilities:
- Full system governance and operational oversight
- Approve/reject property submissions
- Manage users and verification workflows
- Monitor analytics and audit trails

Key capabilities:
- Access all dashboard tabs including approvals, users, analytics, audit, and system
- Create/update/delete users and assign roles
- Manage all listings, payments, reservations, and inquiries
- View and maintain audit logs

Primary references:
- src/lib/rbac.ts
- src/pages/DashboardPage.tsx
- api/users.php
- api/properties.php
- api/audit-logs.php

### Agent
Core responsibilities:
- Manage own listings and respond to buyer leads
- Coordinate appointments and communication

Key capabilities:
- Create and manage own listings
- Handle inquiries and appointments
- Access dashboard for operational workflows

Primary references:
- src/lib/rbac.ts
- src/pages/DashboardPage.tsx
- api/properties.php
- api/inquiries.php
- api/appointments.php

### Seller
Core responsibilities:
- Publish and maintain own property inventory
- Coordinate inquiries, appointments, and payments for owned listings

Key capabilities:
- Create and edit own listings (subject to approval flow)
- Track inquiries and appointments
- Monitor payment and reservation status

Primary references:
- src/lib/rbac.ts
- src/pages/DashboardPage.tsx
- api/properties.php
- api/inquiries.php
- api/payments.php
- api/reservations.php

### Buyer
Core responsibilities:
- Discover properties and express interest
- Manage reservation and payment journey

Key capabilities:
- Browse listings and property details
- Save favorites
- Send inquiries and manage appointments
- Submit/track payments and reservations

Primary references:
- src/lib/rbac.ts
- src/pages/DashboardPage.tsx
- api/favorites.php
- api/inquiries.php
- api/appointments.php
- api/payments.php
- api/reservations.php

### Clerk
Core responsibilities:
- Front-desk operations and user verification support
- Appointment and payment coordination

Key capabilities:
- Manage appointments/inquiries/payments/reservations in clerk workflow
- Perform user verification actions for buyer/seller contexts

Primary references:
- src/lib/rbac.ts
- src/pages/DashboardPage.tsx
- api/users.php
- api/appointments.php
- api/payments.php

## 12) Feature Catalog (Functional Modules)

### Authentication and Identity
- Registration and login
- Session token issuance and refresh
- Logout from single/all devices
- Forgot/reset password
- Email verification request/confirmation

Backend files:
- api/auth.php
- api/helpers.php

Frontend files:
- src/lib/auth.ts
- src/pages/LoginPage.tsx
- src/pages/RegisterPage.tsx

### Property Listing Lifecycle
- Listing creation/edit/delete
- Admin approval and rejection flow
- Search/filter/sort and paginated retrieval
- Property detail with owner context and reservation state

Backend files:
- api/properties.php

Frontend files:
- src/pages/ListingsPage.tsx
- src/pages/PropertyDetailPage.tsx
- src/pages/SellPage.tsx
- src/lib/api.ts

### Inquiry and Messaging Workflow
- Buyer-to-owner inquiries
- Reply/read/message threading behavior
- Inquiry status transitions and dashboard actions

Backend files:
- api/inquiries.php

Frontend files:
- src/pages/DashboardPage.tsx
- src/lib/api.ts

### Appointment Management
- Viewing and walk-in payment appointment types
- Pending/confirmed/cancelled/completed state transitions
- Role-based operational handling in dashboards

Backend files:
- api/appointments.php

Frontend files:
- src/pages/DashboardPage.tsx
- src/lib/api.ts

### Favorites and Discovery
- Save/remove favorite properties
- Personalized favorites tab for buyers

Backend files:
- api/favorites.php

Frontend files:
- src/pages/DashboardPage.tsx
- src/lib/api.ts

### Payments and Reservations
- Payment creation and review workflows
- Reservation lifecycle tracking
- Integration into buyer/admin/clerk dashboard views

Backend files:
- api/payments.php
- api/reservations.php

Frontend files:
- src/pages/DashboardPage.tsx
- src/lib/api.ts

### User Verification and User Management
- User listing/search/filter
- Role updates and profile-level changes
- Verification approve/reject actions with notes/history
- Soft delete for user records

Backend files:
- api/users.php
- api/profile.php

Frontend files:
- src/pages/dashboard/AdminUsersTab.tsx
- src/pages/dashboard/ProfileTab.tsx
- src/lib/api.ts

### Analytics, Audit, Notifications, and System Ops
- Admin analytics panels
- Audit log retrieval and monitoring
- Notification generation and unread tracking
- System-level admin controls

Backend files:
- api/audit-logs.php
- api/notifications.php

Frontend files:
- src/pages/dashboard/AdminAnalyticsTab.tsx
- src/pages/dashboard/AdminAuditTab.tsx
- src/pages/dashboard/AdminSystemTab.tsx
