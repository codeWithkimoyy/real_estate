<?php

declare(strict_types=1);

/**
 * Contract Smoke Tests — Envelope validation & per-role endpoint access
 *
 * Tests public endpoints, auth enforcement, and basic access for each role:
 *   buyer, seller, admin (administrator), clerk
 *
 * Run:
 *   TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=secret \
 *   php tests/api/contract_smoke.php
 */

require_once __DIR__ . '/helpers/TestHarness.php';

$t = new TestHarness();

fwrite(STDOUT, "=== Contract Smoke Tests ===\n\n");

/* ══════════════════════════════════════════════════════════
   SECTION 1: Public Endpoint & Auth Envelope
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "-- Public & Auth Envelope --\n");

// S01 — Public endpoint returns standard success envelope
$r = $t->get('market-insights.php');
$t->assertStatus('S01: market-insights → 200', $r, 200);
$t->assertBodyKey('S01: market-insights success=true', $r, 'success', true);
$t->assertBodyKeyExists('S01: market-insights has ok', $r, 'ok');
$t->assertBodyKeyExists('S01: market-insights has requestId', $r, 'requestId');

// S02 — Protected endpoint without token returns 401 with structured error
$r = $t->get('notifications.php');
$t->assertStatus('S02: notifications unauthenticated → 401', $r, 401);
$t->assertBodyKeyExists('S02: notifications has error.code', $r, 'error.code');
$t->assertBodyKeyExists('S02: notifications has error.message', $r, 'error.message');

// S03 — Invalid token returns 401
$r = $t->get('notifications.php', 'invalid_garbage_token_12345');
$t->assertStatus('S03: invalid token → 401', $r, 401);

/* ══════════════════════════════════════════════════════════
   SECTION 2: Provision Roles & Per-Role Smoke
   ══════════════════════════════════════════════════════════ */

$t->clearRateLimits();

fwrite(STDOUT, "\n--- Provisioning test users ---\n");
$t->provisionUsers();

fwrite(STDOUT, "\n-- Admin (administrator) Role --\n");

// S04 — Admin can list users
$r = $t->get('users.php', $t->token('admin'));
$t->assertStatus('S04: admin list users → 200', $r, 200);

// S05 — Admin can view audit logs
$r = $t->get('audit-logs.php', $t->token('admin'));
$t->assertStatusIn('S05: admin view audit logs → 200', $r, [200]);

// S06 — Admin can view properties
$r = $t->get('properties.php', $t->token('admin'));
$t->assertStatus('S06: admin list properties → 200', $r, 200);

// S07 — Admin can view notifications
$r = $t->get('notifications.php', $t->token('admin'));
$t->assertStatus('S07: admin notifications → 200', $r, 200);

// S08 — Admin can view payments
$r = $t->get('payments.php', $t->token('admin'));
$t->assertStatus('S08: admin list payments → 200', $r, 200);

fwrite(STDOUT, "\n-- Buyer Role --\n");

// S09 — Buyer can view properties
$r = $t->get('properties.php', $t->token('buyer'));
$t->assertStatus('S09: buyer list properties → 200', $r, 200);

// S10 — Buyer can view own notifications
$r = $t->get('notifications.php', $t->token('buyer'));
$t->assertStatus('S10: buyer notifications → 200', $r, 200);

// S11 — Buyer can view favorites
$r = $t->get('favorites.php', $t->token('buyer'));
$t->assertStatusIn('S11: buyer favorites → 200', $r, [200]);

// S12 — Buyer can view own reservations
$r = $t->get('reservations.php', $t->token('buyer'));
$t->assertStatusIn('S12: buyer reservations → 200', $r, [200]);

// S13 — Buyer can view own payments
$r = $t->get('payments.php', $t->token('buyer'));
$t->assertStatusIn('S13: buyer payments → 200', $r, [200]);

// S14 — Buyer cannot access admin-only endpoints
$r = $t->get('audit-logs.php', $t->token('buyer'));
$t->assertStatusIn('S14: buyer audit logs → denied', $r, [401, 403]);

// S15 — Buyer cannot list users
$r = $t->get('users.php', $t->token('buyer'));
$t->assertStatusIn('S15: buyer list users → denied', $r, [401, 403]);

fwrite(STDOUT, "\n-- Seller Role --\n");

// S16 — Seller can view properties
$r = $t->get('properties.php', $t->token('seller'));
$t->assertStatus('S16: seller list properties → 200', $r, 200);

// S17 — Seller can view own notifications
$r = $t->get('notifications.php', $t->token('seller'));
$t->assertStatus('S17: seller notifications → 200', $r, 200);

// S18 — Seller cannot access audit logs
$r = $t->get('audit-logs.php', $t->token('seller'));
$t->assertStatusIn('S18: seller audit logs → denied', $r, [401, 403]);

// S19 — Seller cannot list users
$r = $t->get('users.php', $t->token('seller'));
$t->assertStatusIn('S19: seller list users → denied', $r, [401, 403]);

// S20 — Seller can view own payments
$r = $t->get('payments.php', $t->token('seller'));
$t->assertStatusIn('S20: seller payments → 200', $r, [200]);

fwrite(STDOUT, "\n-- Clerk Role --\n");

// S21 — Clerk can view properties
$r = $t->get('properties.php', $t->token('clerk'));
$t->assertStatus('S21: clerk list properties → 200', $r, 200);

// S22 — Clerk can view own notifications
$r = $t->get('notifications.php', $t->token('clerk'));
$t->assertStatus('S22: clerk notifications → 200', $r, 200);

// S23 — Clerk can list users (limited scope — buyers/sellers only)
$r = $t->get('users.php', $t->token('clerk'));
$t->assertStatusIn('S23: clerk list users → 200', $r, [200]);

// S24 — Clerk cannot access audit logs (admin-only)
$r = $t->get('audit-logs.php', $t->token('clerk'));
$t->assertStatusIn('S24: clerk audit logs → denied', $r, [401, 403]);

// S25 — Clerk view appointments
$r = $t->get('appointments.php', $t->token('clerk'));
$t->assertStatusIn('S25: clerk appointments → 200', $r, [200]);

/* ══════════════════════════════════════════════════════════
   SECTION 3: Cross-Role Endpoint Matrix
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- Cross-Role Endpoint Matrix --\n");

// Each role hits key endpoints; verify expected status codes
$endpointMatrix = [
    // [endpoint, role, expectedStatuses, label]
    ['properties.php', 'admin',  [200],      'admin → properties'],
    ['properties.php', 'buyer',  [200],      'buyer → properties'],
    ['properties.php', 'seller', [200],      'seller → properties'],
    ['properties.php', 'clerk',  [200],      'clerk → properties'],
    ['payments.php',   'admin',  [200],      'admin → payments'],
    ['payments.php',   'buyer',  [200],      'buyer → payments'],
    ['payments.php',   'seller', [200],      'seller → payments'],
    ['payments.php',   'clerk',  [200, 403], 'clerk → payments'],
    ['users.php',      'admin',  [200],      'admin → users'],
    ['users.php',      'buyer',  [401, 403], 'buyer → users'],
    ['users.php',      'seller', [401, 403], 'seller → users'],
    ['users.php',      'clerk',  [200],      'clerk → users'],
    ['audit-logs.php', 'admin',  [200],      'admin → audit-logs'],
    ['audit-logs.php', 'buyer',  [401, 403], 'buyer → audit-logs'],
    ['audit-logs.php', 'seller', [401, 403], 'seller → audit-logs'],
    ['audit-logs.php', 'clerk',  [401, 403], 'clerk → audit-logs'],
];

foreach ($endpointMatrix as [$endpoint, $role, $expected, $label]) {
    $r = $t->get($endpoint, $t->token($role));
    $t->assertStatusIn("S-matrix: {$label}", $r, $expected);
}

/* ──────────────────────────────────────────────────────────
   Teardown & Summary
   ────────────────────────────────────────────────────────── */

$t->teardown();
exit($t->printSummary());
