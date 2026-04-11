# EstateFlow

A full-stack real estate platform built with **React + TypeScript** (frontend) and **PHP + MySQL** (backend).

> **Note:** This project is still under active development. Features and structure may change.

## Features

- Property browsing, search, and detailed listings
- User registration & login with session-based auth
- Role-based access control (Administrator, Agent, Seller, Buyer, Clerk)
- Role-adaptive dashboards with module-specific tabs
- Inquiries, favorites, appointments, and notifications
- Payments and reservation tracking
- Property image uploads
- Dispute management
- Admin tools: user management, audit logs, analytics, system controls
- Google Sign-In integration

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, React Router, Tailwind CSS, GSAP |
| Backend | PHP 8.x, MySQL (InnoDB) |
| Build | Vite |
| Server | Apache (WAMP / XAMPP) |

## Prerequisites

- **PHP** 8.0+
- **MySQL** 5.7+ or MariaDB 10.3+
- **Node.js** 18+
- **Apache** with mod_rewrite enabled (WAMP, XAMPP, or similar)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/codeWithkimoyy/real_estate.git
cd real_estate
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and configure your database credentials and other settings.

### 4. Set up the database

Import the schema and migrations into MySQL:

```sql
SOURCE database/schema.sql;
SOURCE database/migration_v2.sql;
SOURCE database/migrate_all.sql;
```

### 5. Run the app

**Development (with Vite hot reload):**

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API calls to your Apache/PHP backend.

**Production build:**

```bash
npm run build
```

This outputs to `dist/`. Apache serves the built app and API from the same host via `.htaccess`.

## Project Structure

```
├── api/                # PHP backend API endpoints
├── database/           # SQL schema and migration files
├── integrations/       # Third-party integrations (Google Sign-In)
├── public/             # Static assets (images, favicon)
├── src/
│   ├── components/     # Shared React components
│   ├── data/           # TypeScript types and data
│   ├── lib/            # API client, auth, RBAC utilities
│   └── pages/          # Page components and dashboard tabs
├── storage/            # File uploads (gitignored)
├── .env.example        # Environment variable template
└── vite.config.ts      # Vite configuration
```

## User Roles

| Role | Description |
|------|-------------|
| **Administrator** | Full system governance, user management, approvals, audit logs |
| **Agent** | Manage own listings, handle inquiries and appointments |
| **Seller** | Publish properties, track inquiries, payments, reservations |
| **Buyer** | Browse listings, save favorites, make inquiries and payments |
| **Clerk** | Front-desk operations, user verification, appointment coordination |

## License

This project is for educational and personal use.
