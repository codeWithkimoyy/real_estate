# Brader Real Estate

A full-stack real estate platform built with **React + TypeScript** (frontend) and **PHP + MySQL** (backend).

> Status: Active development. Features and structure may change as the project evolves.

## Core Features

- Property browsing, filtering, and detailed listings
- User registration and login with session-based authentication
- Role-based access control: Administrator, Agent, Seller, Buyer, Clerk
- Dashboard modules based on role permissions
- Inquiries, favorites, appointments, and notifications
- Payments, reservations, and dispute handling
- Property image uploads
- Admin tools: user management, audit logs, analytics, system controls
- Google Sign-In integration

## Tech Stack

- Frontend: React 19, TypeScript, React Router, Tailwind CSS, GSAP
- Backend: PHP 8+, MySQL (InnoDB)
- Build Tool: Vite
- Server: Apache (WAMP or XAMPP)

## Prerequisites

- Node.js 18+
- PHP 8.0+
- MySQL 5.7+ or MariaDB 10.3+
- Apache with `mod_rewrite` enabled

## Local Setup

1. Clone the repository:

```bash
git clone https://github.com/codeWithkimoyy/real_estate.git
cd real_estate
```

2. Install frontend dependencies:

```bash
npm install
```

3. Configure environment:

```bash
cp .env.example .env
```

Then edit `.env` with your local database and API settings.

4. Set up the database by importing SQL files in this order:

- `database/schema.sql`
- `database/migration_v2.sql`
- `database/migrate_all.sql`

5. Run the development server:

```bash
npm run dev
```

- Frontend default URL: `http://localhost:5173`
- Backend/API base URL (frontend default): `http://localhost/Activities/real_estate/api`

6. Build for production:

```bash
npm run build
```

## Project Structure

```text
api/                         PHP API endpoints
database/                    Schema and migration SQL files
integrations/google-login/   Google authentication integration
public/                      Static assets
src/components/              Shared React components
src/lib/                     API client, auth, RBAC utilities
src/pages/                   Page-level UI and dashboard tabs
storage/uploads/             Uploaded files (should be gitignored)
```

## Available Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Type-check and build production bundle
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Roles

- Administrator: Full system governance, approvals, logs, analytics
- Agent: Manages listings, inquiries, appointments
- Seller: Publishes properties and tracks transactions
- Buyer: Browsing, favorites, inquiries, payments
- Clerk: Verification and appointment support operations

## Notes

- Keep secrets in `.env` and never commit them.
- Ensure `storage/uploads` and `public/images/uploads` are gitignored if runtime-generated.
- If image previews fail in local development, verify API base URL and upload path mapping.

## License

Educational and personal use.