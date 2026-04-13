# Brader Real Estate Project Overview

## 1) Project Summary
Brader Real Estate is a full-stack real estate platform with a React + TypeScript frontend and a PHP + MySQL backend.

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

## 13) Detailed Role Behavior and Connections

This section describes how each role behaves in the system, who they directly interact with, what they can do, and what they cannot do based on current frontend RBAC and backend guards.

### Administrator
Connections:
- Interacts with all roles: buyer, seller, agent, clerk, and other admins.
- Receives system notifications for pending listing approvals and verification submissions.

Can do:
- Full dashboard access (approvals, users, analytics, audit, system, listings, communication, finance).
- Create listings (auto-approved), approve/reject other users' listings.
- View all inquiries, appointments, payments, reservations, disputes.
- Create/update/delete users (except cannot delete own admin account).
- Verify/reject identity verification for any role.
- Resolve disputes and process refunds (refund action is admin-only).
- Access audit logs.

Cannot do:
- Cannot soft-delete own admin account.
- Cannot bypass required fields/validation for create/update endpoints.

### Agent
Connections:
- Primary interaction with buyers (inquiries, appointments, reservations, payments as property owner).
- Secondary interaction with admins/clerks for verification and operational approvals.

Can do:
- Create and manage own listings.
- View own inquiries (as receiver) and participate in inquiry thread.
- View/manage appointments where they are the assigned property owner/agent.
- View reservations tied to properties they own.
- Update reservation status for properties they own (confirm/cancel/complete under rules).
- Verify users only when target role is buyer or seller.

Cannot do:
- Cannot approve/reject listings globally.
- Cannot create users.
- Cannot delete users.
- Cannot verify admins/agents/clerks.
- Cannot process payment refunds.
- Cannot update payment status unless they are the seller on that payment.

### Seller
Connections:
- Primary interaction with buyers for inquiries, appointments, reservations, and payments.
- Interaction with admins for listing approval and verification process.

Can do:
- Create and manage own listings.
- Receive and respond to inquiries for owned properties.
- Participate in appointments as property owner.
- View reservations for owned properties and update reservation status per rules.
- Receive buyer payment submissions for owned properties.
- Update payment status for payments where they are the seller.

Cannot do:
- Cannot approve/reject listings globally.
- Cannot create users or verify users.
- Cannot process refunds (admin only).
- Cannot create payments/reservations/inquiries against own property.

### Buyer
Connections:
- Interacts mainly with seller/agent (owner) through inquiries, appointments, reservations, and payments.
- Interacts with admin/clerk for verification outcomes and dispute outcomes.

Can do:
- Browse approved listings and property details.
- Create inquiries, appointments, reservations, and payments for eligible properties.
- Manage favorites.
- View own inquiries, appointments, reservations, and payments.
- Submit verification documents from profile.
- File disputes and view own disputes.

Cannot do:
- Cannot create listings.
- Cannot view all users or manage users.
- Cannot update payment status/review.
- Cannot confirm reservation status (active) unless owner/admin performs action.
- Cannot see non-approved properties unless owner/admin context applies.

### Clerk
Connections:
- Interacts with buyers/sellers for verification workflows.
- Interacts with appointments/inquiries/payments/reservations as operations role.
- Supports admins with front-desk processing.

Can do:
- View all inquiries and appointments.
- Manage appointment statuses.
- View all payments and update payment statuses.
- View all reservations (admin/clerk visibility scope).
- Access user list but limited to buyer/seller targets.
- Verify/reject only buyer/seller verification requests.

Cannot do:
- Cannot create users.
- Cannot delete users.
- Cannot verify admin/agent/clerk users.
- Cannot resolve disputes (admin-only patch action).
- Cannot process refunds (admin-only action).

## 14) End-to-End Interaction Flows (Who Connects to Whom)

### Flow A: Listing lifecycle
1. Seller/Agent creates listing -> status is pending (admin listings may auto-approve).
2. Admin reviews pending listing -> approve or reject.
3. Owner receives notification of listing decision.

### Flow B: Inquiry lifecycle
1. Buyer sends inquiry on a property (cannot inquire on own property).
2. Receiver is property owner (seller/agent).
3. Owner and buyer exchange thread messages.
4. Admin/clerk can view all inquiries for oversight.

### Flow C: Appointment lifecycle
1. Buyer requests appointment for a property.
2. Assigned agent is property owner.
3. Owner/participant/admin/clerk updates status (pending/confirmed/cancelled/completed).
4. Counterparty receives status notifications.

### Flow D: Reservation lifecycle
1. Buyer requests reservation (property must be approved, not self-owned, not already locked).
2. Property owner (seller/agent) or admin confirms to active.
3. Owner/admin can cancel; completion handled by authorized roles.
4. Buyer receives reservation status notifications.

### Flow E: Payment lifecycle
1. Buyer submits payment to seller for approved property.
2. Seller/admin/clerk updates payment status.
3. Buyer receives payment status notification.
4. Refund path is admin-only and only for completed payments.

### Flow F: Verification lifecycle
1. Buyer/Seller/Agent/Clerk submits verification document via profile.
2. Admin receives verification request notifications.
3. Admin may verify/reject anyone.
4. Agent/Clerk may verify/reject only buyer/seller.
5. User receives verification result notification.

### Flow G: Dispute lifecycle
1. Any authenticated user can file dispute.
2. Admins are notified and investigate.
3. Admin updates dispute status (investigating/resolved/dismissed).
4. Reporter receives dispute status update notification.

## 15) Hard Restrictions and Guardrails (Current Implementation)

- Public signup roles are limited to: buyer, seller, agent, clerk.
- Only seller/agent/administrator can create listings.
- Non-admin listing creators must be verification_status = verified.
- Buyers cannot perform actions against their own properties (inquiry/payment/reservation guards).
- Reservation and payment creation enforce reservation lock checks.
- User management endpoint is accessible only to administrator/agent/clerk, with create/delete restricted to admin.
- Clerk visibility in users list is restricted to buyer and seller records.
- Audit log endpoint is admin-only.
- Dispute resolution (PATCH) is admin-only.
- Reservation delete is admin-only.
- Payment refund action is admin-only.
- Session/token lifecycle and rate limits are enforced centrally in helpers.

## 16) Platform Hardening Priorities (Critical Improvements)

These are high-impact improvements needed to move from a strong project to production-grade platform reliability.

### 16.1 Backend Error Handling (Highest Priority)

Current risk:
- Frontend occasionally receives HTML/PHP errors (`unexpected <`) instead of JSON.

Required standard:
```json
{
  "success": false,
  "error": {
	 "code": "INTERNAL_ERROR",
	 "message": "Something went wrong"
  }
}
```

Action plan:
1. Implement one global error responder used by all endpoints.
2. Force all exceptions and PHP errors through that responder.
3. Disable raw PHP error output in API responses for non-dev environments.
4. Add request ID and structured server logging for debugging.

Acceptance criteria:
- No endpoint returns HTML on failure.
- All 4xx/5xx responses match one JSON error envelope.

### 16.2 Migration Versioning System

Current risk:
- Manual schema alignment can drift between machines/environments.

Action plan:
1. Create a `migrations` table (id, name, checksum, executed_at).
2. Track executed SQL migration files in order.
3. Add a migration runner script (`php migrate.php`) with:
	- pending migration discovery
	- transactional execution where applicable
	- success/failure output
4. Add optional rollback metadata for reversible migrations.

Acceptance criteria:
- Running `php migrate.php` on any environment yields deterministic DB state.
- Re-running migrations is idempotent (already-applied scripts are skipped).

### 16.3 API Response Standardization

Current risk:
- Inconsistent response shapes increase frontend parsing complexity and bugs.

Required response envelopes:

Success:
```json
{
  "success": true,
  "data": {}
}
```

Failure:
```json
{
  "success": false,
  "error": {
	 "code": "VALIDATION_ERROR",
	 "message": "Invalid input",
	 "details": {}
  }
}
```

Action plan:
1. Introduce shared helpers for success/error envelopes.
2. Refactor all API files to use standardized wrappers.
3. Keep pagination metadata in a consistent `meta` object.

Acceptance criteria:
- Frontend `api.ts` can use one common parser path for all endpoints.

### 16.4 Monolithic PHP Growth Risk

Current risk:
- Resource files will become harder to maintain as business rules grow.

Recommended phased evolution:
1. Phase 1 (now): Add internal layering without framework migration:
	- `services/` for business logic
	- `repositories/` for DB access
	- keep existing endpoint files as thin controllers
2. Phase 2 (future): Evaluate framework migration when team/product scale demands it:
	- Laravel (full-featured)
	- Slim/Lumen-style lightweight architecture

Acceptance criteria:
- Endpoint files primarily validate input + call service methods.

### 16.5 Missing Real-Time Layer

Current risk:
- Inquiries/notifications are polling-heavy and less responsive.

Upgrade path:
1. Short-term: Server-Sent Events (SSE) for notifications.
2. Mid-term: WebSocket gateway (Pusher, Socket.IO, or framework-native option).

First targets:
- inquiry threads/messages
- notification badge updates
- appointment/payment status updates

Acceptance criteria:
- New events appear in UI without manual refresh/poll wait cycle.

### 16.6 Dashboard Frontend Scaling Risk

Current risk:
- `DashboardPage.tsx` is role-dense and will become difficult to evolve safely.

Action plan:
1. Split dashboard by role modules:
	- `src/pages/dashboard/buyer/*`
	- `src/pages/dashboard/admin/*`
	- `src/pages/dashboard/clerk/*`
	- `src/pages/dashboard/shared/*`
2. Keep shared table, filters, cards, and status chips in reusable components.

Acceptance criteria:
- Role-specific logic is isolated and easier to test/review.

### 16.7 Testing Gap (Major)

Current risk:
- RBAC and finance/reservation logic can regress silently.

Minimum test coverage to add:
1. Auth tests:
	- login/refresh/logout/forgot/reset
2. RBAC tests:
	- role permissions per endpoint
	- forbidden access checks (403)
3. Reservation/payment edge cases:
	- self-action blocking
	- lock conflicts
	- refund constraints
4. Verification workflow tests:
	- submit -> review -> approve/reject

Suggested tools:
- PHPUnit for backend endpoint tests
- Postman/Newman collections for API contract regression

Acceptance criteria:
- CI runs role-sensitive API tests on every change.

## 17) Strategic Positioning

EstateFlow already operates as a mini property marketplace SaaS architecture with:
- role-aware operations
- transaction-like domain workflows (reservations/payments/disputes)
- governance features (audit + verification)

With the hardening priorities above, the system can move from portfolio/thesis quality to startup-ready production baseline.
