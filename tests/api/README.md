# API Test Suite

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `API_BASE_URL` | No | `http://localhost/Activities/real_estate/api` | API root |
| `API_BEARER_TOKEN` | Smoke only | — | Pre-existing token for smoke test |
| `TEST_ADMIN_EMAIL` | RBAC + Data | — | Admin login for provisioning |
| `TEST_ADMIN_PASSWORD` | RBAC + Data | — | Admin password |

## Test Suites

### 1. Contract Smoke (`contract_smoke.php`)

```bash
php tests/api/contract_smoke.php
```

Quick envelope validation. No data mutation.

- Standard JSON envelope keys (`success`, `ok`, `requestId`)
- Error envelope shape (`error.code`, `error.message`)
- Auth-protected endpoint behavior when token is missing

### 2. RBAC Boundaries (`rbac_boundaries.php`)

```bash
TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=secret \
  php tests/api/rbac_boundaries.php
```

Permission boundary tests (19 cases):

- **Vertical escalation**: buyer → admin actions (approve, refund, user mgmt, dispute resolution)
- **Horizontal isolation**: buyer A vs buyer B data, seller A vs seller B properties
- **Auth enforcement**: unauthenticated access, invalid tokens, self-delete prevention
- **Role-specific scoping**: buyer sees only own payments/reservations, clerk sees only buyer/seller
- **Registration guard**: cannot register as administrator

### 3. Data Consistency (`data_consistency.php`)

```bash
TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=secret \
  php tests/api/data_consistency.php
```

Referential integrity and state machine tests (20 cases):

- **FK guards**: payment for non-existent property, reservation for unapproved property
- **Self-transaction**: owner cannot pay for own listing
- **Duplicate prevention**: multiple active reservations on same property
- **State machines**: valid/invalid transitions for payments, reservations, properties
- **Concurrency**: parallel reservations, parallel status updates, duplicate registration
- **Boundary values**: negative/zero amounts, 0-day and 365-day reservations
- **Soft-delete visibility**: deleted properties hidden from listings

## Architecture

```
tests/api/
├── contract_smoke.php       # Envelope validation (standalone)
├── rbac_boundaries.php      # Permission tests (uses TestHarness)
├── data_consistency.php     # Data integrity tests (uses TestHarness)
├── helpers/
│   └── TestHarness.php      # Shared HTTP client, assertions, provisioning
└── README.md
```

### TestHarness Features

- **Auto-provisioning**: registers admin + 4 role-specific users per run
- **Seed data**: creates properties, payments, reservations, disputes
- **Parallel requests**: `curl_multi` for concurrency tests
- **Auto-teardown**: cleans up all seeded records in FK-safe order
- **Rich assertions**: status codes, body keys, role filtering, dot-notation access

## Running All Tests

```bash
# PowerShell
$env:TEST_ADMIN_EMAIL="admin@example.com"
$env:TEST_ADMIN_PASSWORD="secret"

php tests/api/contract_smoke.php
php tests/api/rbac_boundaries.php
php tests/api/data_consistency.php
```

Exit code 0 = all passed, 1 = failures detected.
