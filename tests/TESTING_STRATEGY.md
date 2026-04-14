# EstateFlow — Testing Strategy: Permission Boundaries & Data Consistency

## 1. Threat Model & Test Matrix

### 1.1 Permission Boundary Threat Vectors

| Vector | Risk | Test Layer |
|--------|------|------------|
| **Horizontal privilege escalation** | Buyer A accesses Buyer B's payments/reservations | API integration |
| **Vertical privilege escalation** | Buyer calls admin-only endpoints (approve, refund, user mgmt) | API integration |
| **Role impersonation** | Agent attempts clerk/admin-only verification actions | API integration |
| **IDOR via query param** | Authenticated user guesses `?id=N` for unauthorized resource | API integration |
| **Soft-delete bypass** | Accessing soft-deleted properties/users via direct ID | API integration |
| **Frontend-only guard** | Backend missing permission check the frontend enforces | Contract diff |

### 1.2 Data Consistency Threat Vectors

| Vector | Risk | Test Layer |
|--------|------|------------|
| **Duplicate active reservations** | Two users reserve same property concurrently | Concurrency |
| **Orphaned records on soft-delete** | Payments/inquiries/appointments point to deleted property | DB constraint |
| **Refund + status race** | Concurrent PATCH to same payment produces inconsistent state | Concurrency |
| **Stale reservation served as active** | `expire_stale()` not called before GET | State lifecycle |
| **Self-transaction** | Buyer pays for own property, reserves own listing | Business rule |
| **Cascading FK violations** | Hard-delete user with active payments/disputes | DB constraint |

---

## 2. Test Architecture

```
tests/
├── api/
│   ├── contract_smoke.php          # Existing — envelope validation
│   ├── rbac_boundaries.php         # NEW — permission boundary tests
│   ├── data_consistency.php        # NEW — data integrity tests
│   ├── helpers/
│   │   └── TestHarness.php         # NEW — shared test utilities
│   └── README.md                   # Updated
```

### 2.1 Test Harness Design

```
TestHarness::setup()
  ├── Register admin, agent, seller, buyer, clerk users
  ├── Login each, store tokens
  ├── Create seed properties (approved, pending, rejected, soft-deleted)
  ├── Create seed payments, reservations, inquiries
  └── Return TestContext with all tokens + resource IDs

TestHarness::teardown()
  └── Delete all seed data via admin token (reversible)
```

### 2.2 Naming Convention

```
test_{resource}_{action}_{role}_{expected_outcome}
```

Examples:
- `test_payments_refund_buyer_denied`
- `test_properties_approve_admin_success`
- `test_reservations_create_duplicate_rejected`

---

## 3. RBAC Boundary Test Cases (Priority Order)

### 3.1 Critical — Cross-Role Escalation

| # | Test | Expected |
|---|------|----------|
| R01 | Buyer calls `PATCH /properties.php?id=N&action=approve` | 403 |
| R02 | Seller calls `PATCH /payments.php?id=N` with `refund_amount` | 403 |
| R03 | Agent calls `POST /users.php` (admin-only create) | 403 |
| R04 | Clerk calls `DELETE /properties.php?id=N` (not owner) | 403 |
| R05 | Buyer calls `PATCH /disputes.php?id=N` with resolution | 403 |
| R06 | Agent calls `PATCH /users.php?id=N` with `verificationAction=verify` on admin user | 403 |

### 3.2 Critical — Horizontal (Same-Role) Isolation

| # | Test | Expected |
|---|------|----------|
| R07 | Buyer A GETs Buyer B's payment via `?id=N` | 403 |
| R08 | Buyer A GETs Buyer B's reservation via `?id=N` | 403 |
| R09 | Seller A PATCHes Seller B's property | 403 |
| R10 | Buyer A views unapproved property they don't own | 404 or filtered |
| R11 | Clerk lists users — result contains only buyer/seller roles | No admin/agent/clerk in list |

### 3.3 High — Business Rule Enforcement

| # | Test | Expected |
|---|------|----------|
| R12 | Unauthenticated POST to any protected endpoint | 401 |
| R13 | Expired/invalid token on protected endpoint | 401 |
| R14 | Admin cannot delete own account | 403 |
| R15 | Register with role=administrator | 400/403 |
| R16 | Unverified seller creates property | 403 |

---

## 4. Data Consistency Test Cases (Priority Order)

### 4.1 Critical — Referential Integrity

| # | Test | Expected |
|---|------|----------|
| D01 | Create payment with non-existent `property_id` | 400/404 |
| D02 | Create reservation for soft-deleted property | 400/404 |
| D03 | Buyer pays for own property (`buyer_id == owner_id`) | 400 |
| D04 | Create duplicate active reservation on same property | 400/409 |
| D05 | Soft-delete property → verify payments still return cleanly | 200, no broken refs |
| D06 | Payment refund sets `refund_amount` + `refund_reason` + status atomically | All 3 fields consistent |

### 4.2 High — State Machine Integrity

| # | Test | Expected |
|---|------|----------|
| D07 | Reservation status: pending → active → completed | Valid transitions succeed |
| D08 | Reservation status: completed → active (invalid rollback) | 400 |
| D09 | Payment status: pending → completed → refunded | Valid flow |
| D10 | Payment status: refunded → completed (invalid rollback) | 400 |
| D11 | Property: pending → approved → sold | Valid transitions |
| D12 | Property: sold → pending (invalid rollback) | 400 |

### 4.3 Medium — Concurrency Safety

| # | Test | Expected |
|---|------|----------|
| D13 | Parallel reservation POSTs for same property | Exactly 1 succeeds |
| D14 | Parallel payment status PATCHes (refund vs complete) | Consistent final state |
| D15 | Register same email twice in parallel | 1 success, 1 conflict |

---

## 5. Execution Plan

### Phase 1 — Immediate (scripts delivered)
- `TestHarness.php`: Shared HTTP client, assertion library, seed/teardown
- `rbac_boundaries.php`: All R01–R16 test cases
- `data_consistency.php`: All D01–D15 test cases

### Phase 2 — CI Integration
- Add `composer test` script or Makefile target
- Run against local XAMPP/Docker-composed MySQL+PHP
- Gate PR merges on test pass

### Phase 3 — Expansion
- Frontend Cypress/Playwright tests for ProtectedRoute guards
- Load testing for concurrency cases (D13–D15)
- Mutation testing to validate test effectiveness

---

## 6. Environment Requirements

| Requirement | Value |
|-------------|-------|
| PHP | >= 8.1 with curl, json, mbstring |
| MySQL | >= 5.7 (InnoDB required for FK constraints) |
| API Base URL | `API_BASE_URL` env var |
| Admin credentials | `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` env vars |
| Isolation | Dedicated test database or seeded namespace |
