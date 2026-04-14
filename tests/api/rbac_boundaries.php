<?php

declare(strict_types=1);

/**
 * RBAC Boundary Tests — Permission escalation & isolation validation
 *
 * Covers:
 *  - Vertical escalation (buyer → admin actions)
 *  - Horizontal isolation (buyer A ≠ buyer B data)
 *  - Role-specific endpoint restrictions
 *  - Auth enforcement on protected routes
 *
 * Run:
 *   TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=secret \
 *   php tests/api/rbac_boundaries.php
 */

require_once __DIR__ . '/helpers/TestHarness.php';

$t = new TestHarness();

fwrite(STDOUT, "=== RBAC Boundary Tests ===\n\n");

/* ──────────────────────────────────────────────────────────
   Phase 1: Provisioning
   ────────────────────────────────────────────────────────── */

fwrite(STDOUT, "--- Provisioning test users ---\n");
$t->provisionUsers();

fwrite(STDOUT, "\n--- Seeding data ---\n");
$propertyId        = $t->seedProperty();        // approved, owned by seller
$pendingPropertyId = $t->seedPendingProperty();  // pending, owned by seller
$reservationId     = $t->seedReservation($propertyId);
$paymentId         = $t->seedPayment($propertyId);
$disputeId         = $t->seedDispute($propertyId);

// Register a second buyer for horizontal isolation tests
$suffix2     = bin2hex(random_bytes(4));
$buyer2Email = "test_buyer2_{$suffix2}@estateflow-test.local";
$buyer2Phone = '09' . str_pad((string) rand(100000000, 999999999), 9, '0');
$buyer2Reg   = $t->post('auth.php?action=register', null, [
    'first_name' => 'Test',
    'last_name'  => 'BuyerTwo',
    'email'      => $buyer2Email,
    'phone'      => $buyer2Phone,
    'password'   => 'TestPass123!',
    'role'       => 'buyer',
]);
$buyer2Token = $buyer2Reg['body']['token']
    ?? $buyer2Reg['body']['data']['token']
    ?? $buyer2Reg['body']['session']['token']
    ?? '';
$buyer2Id = (int) ($buyer2Reg['body']['data']['id'] ?? $buyer2Reg['body']['user']['id'] ?? 0);

fwrite(STDOUT, "\n--- Running tests ---\n\n");

/* ══════════════════════════════════════════════════════════
   SECTION 1: Vertical Privilege Escalation
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "-- Vertical Privilege Escalation --\n");

// R01 — Buyer cannot approve a property
$r = $t->patch("properties.php?id={$propertyId}&action=approve", $t->token('buyer'));
$t->assertStatusIn('R01: buyer approve property → denied', $r, [401, 403]);

// R02 — Seller cannot issue refunds
$r = $t->patch("payments.php?id={$paymentId}", $t->token('seller'), [
    'status'        => 'refunded',
    'refund_amount' => 10000,
    'refund_reason' => 'test escalation',
]);
// Seller may update some payment fields but refund should be admin-only
if ($r['status'] === 200) {
    // If 200, verify refund fields were NOT set
    $check = $t->get("payments.php?id={$paymentId}", $t->token('admin'));
    $refundAmount = $check['body']['data']['refund_amount'] ?? $check['body']['payment']['refund_amount'] ?? null;
    $t->assertTrue(
        'R02: seller refund blocked even if status updated',
        $refundAmount === null || (int) $refundAmount === 0,
        "refund_amount was set to {$refundAmount} by seller"
    );
} else {
    $t->assertStatusIn('R02: seller refund → denied', $r, [401, 403]);
}

// R03 — Agent cannot create users (admin-only)
$r = $t->post('users.php', $t->token('agent'), [
    'first_name' => 'Ghost',
    'last_name'  => 'User',
    'email'      => 'ghost@test.local',
    'password'   => 'Pass123!',
    'role'       => 'buyer',
]);
$t->assertStatusIn('R03: agent create user → denied', $r, [401, 403]);

// R04 — Clerk cannot delete property they don't own
$r = $t->delete("properties.php?id={$propertyId}", $t->token('clerk'));
$t->assertStatusIn('R04: clerk delete property → denied', $r, [401, 403]);

// R05 — Buyer cannot resolve disputes (admin-only)
$r = $t->patch("disputes.php?id={$disputeId}", $t->token('buyer'), [
    'status'           => 'resolved',
    'resolution_notes' => 'Test buyer escalation',
]);
$t->assertStatusIn('R05: buyer resolve dispute → denied', $r, [401, 403]);

// R06 — Agent cannot verify admin users
$r = $t->patch("users.php?id=" . $t->userId('admin'), $t->token('agent'), [
    'verificationAction' => 'verify',
    'verification_notes' => 'Agent escalation attempt',
]);
$t->assertStatusIn('R06: agent verify admin → denied', $r, [400, 401, 403]);

/* ══════════════════════════════════════════════════════════
   SECTION 2: Horizontal Isolation (Same-Role Boundaries)
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- Horizontal Isolation --\n");

// R07 — Buyer 2 cannot read Buyer 1's payment
if ($paymentId > 0 && $buyer2Token !== '') {
    $r = $t->get("payments.php?id={$paymentId}", $buyer2Token);
    $t->assertStatusIn('R07: buyer2 view buyer1 payment → denied', $r, [403, 404]);
} else {
    $t->skip('R07: buyer2 view buyer1 payment', 'missing seed data');
}

// R08 — Buyer 2 cannot read Buyer 1's reservation
if ($reservationId > 0 && $buyer2Token !== '') {
    $r = $t->get("reservations.php?id={$reservationId}", $buyer2Token);
    $t->assertStatusIn('R08: buyer2 view buyer1 reservation → denied', $r, [403, 404]);
} else {
    $t->skip('R08: buyer2 view buyer1 reservation', 'missing seed data');
}

// R09 — Create a second seller and verify they can't edit first seller's property
$suffix3      = bin2hex(random_bytes(4));
$seller2Email = "test_seller2_{$suffix3}@estateflow-test.local";
$seller2Phone = '09' . str_pad((string) rand(100000000, 999999999), 9, '0');
$seller2Reg   = $t->post('auth.php?action=register', null, [
    'first_name' => 'Test',
    'last_name'  => 'SellerTwo',
    'email'      => $seller2Email,
    'phone'      => $seller2Phone,
    'password'   => 'TestPass123!',
    'role'       => 'seller',
]);
$seller2Token = $seller2Reg['body']['token']
    ?? $seller2Reg['body']['data']['token']
    ?? $seller2Reg['body']['session']['token']
    ?? '';

if ($propertyId > 0 && $seller2Token !== '') {
    $r = $t->patch("properties.php?id={$propertyId}", $seller2Token, [
        'title' => 'Hijacked Title',
    ]);
    $t->assertStatusIn('R09: seller2 edit seller1 property → denied', $r, [401, 403]);
} else {
    $t->skip('R09: seller2 edit seller1 property', 'missing seed data');
}

// R10 — Buyer cannot view unapproved property they don't own
if ($pendingPropertyId > 0) {
    $r = $t->get("properties.php?id={$pendingPropertyId}", $t->token('buyer'));
    $t->assertStatusIn('R10: buyer view pending property → hidden', $r, [403, 404]);
} else {
    $t->skip('R10: buyer view pending property', 'no pending property seeded');
}

// R11 — Clerk listing users should NOT include admin/agent/clerk roles
$r = $t->get('users.php', $t->token('clerk'));
if ($r['status'] === 200) {
    $users = $r['body']['data'] ?? $r['body']['users'] ?? [];
    $t->assertNotContainsRole('R11a: clerk list → no admin visible', $users, 'administrator');
    $t->assertNotContainsRole('R11b: clerk list → no agent visible', $users, 'agent');
    $t->assertNotContainsRole('R11c: clerk list → no clerk visible', $users, 'clerk');
} else {
    $t->skip('R11: clerk user list filtering', "HTTP {$r['status']}");
}

/* ══════════════════════════════════════════════════════════
   SECTION 3: Auth Enforcement & Business Rules
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- Auth Enforcement & Business Rules --\n");

// R12 — Unauthenticated POST to protected endpoints
$protectedEndpoints = [
    'properties.php', 'payments.php', 'reservations.php',
    'disputes.php', 'appointments.php', 'users.php',
];
foreach ($protectedEndpoints as $ep) {
    $r = $t->post($ep, null, ['test' => true]);
    $t->assertStatusIn("R12: unauthenticated POST {$ep} → 401", $r, [401]);
}

// R13 — Expired/invalid token
$r = $t->get('notifications.php', 'invalid_garbage_token_12345');
$t->assertStatusIn('R13: invalid token → 401', $r, [401]);

// R14 — Admin cannot delete own account
$adminId = $t->userId('admin');
if ($adminId > 0) {
    $r = $t->delete("users.php?id={$adminId}", $t->token('admin'));
    $t->assertStatusIn('R14: admin self-delete → denied', $r, [400, 403]);
} else {
    $t->skip('R14: admin self-delete', 'no admin ID');
}

// R15 — Register with role=administrator should fail
$r = $t->post('auth.php?action=register', null, [
    'first_name' => 'Evil',
    'last_name'  => 'Admin',
    'email'      => 'evil_admin_' . bin2hex(random_bytes(4)) . '@test.local',
    'phone'      => '09' . str_pad((string) rand(100000000, 999999999), 9, '0'),
    'password'   => 'Pass123!',
    'role'       => 'administrator',
]);
$t->assertStatusIn('R15: register as administrator → denied', $r, [400, 403, 422]);

// R16 — Unverified seller creates property should fail
// Use seller2 who was never verified
if ($seller2Token !== '') {
    $r = $t->post('properties.php', $seller2Token, [
        'title'         => 'Unverified Listing',
        'description'   => 'Should be rejected',
        'price'         => 1000000,
        'property_type' => 'lot',
        'listing_type'  => 'sale',
        'bedrooms'      => 0,
        'bathrooms'     => 0,
        'area_sqm'      => 200,
        'address'       => '999 Blocked Street',
        'city'          => 'Manila',
        'province'      => 'Metro Manila',
    ]);
    $t->assertStatusIn('R16: unverified seller create property → denied', $r, [403]);
} else {
    $t->skip('R16: unverified seller create property', 'no seller2 token');
}

/* ══════════════════════════════════════════════════════════
   SECTION 4: Role-Specific Scope Enforcement
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- Role-Specific Scope Enforcement --\n");

// Buyer GET payments should only return own payments
$r = $t->get('payments.php', $t->token('buyer'));
if ($r['status'] === 200) {
    $payments = $r['body']['data'] ?? $r['body']['payments'] ?? [];
    $buyerId  = $t->userId('buyer');
    $allOwn   = true;
    foreach ($payments as $p) {
        if (((int) ($p['buyer_id'] ?? 0)) !== $buyerId && ((int) ($p['seller_id'] ?? 0)) !== $buyerId) {
            $allOwn = false;
            break;
        }
    }
    $t->assertTrue('R17: buyer payments scoped to self', $allOwn, 'found payment not belonging to buyer');
} else {
    $t->skip('R17: buyer payments scoped', "HTTP {$r['status']}");
}

// Buyer GET reservations should only return own or own-property reservations
$r = $t->get('reservations.php', $t->token('buyer'));
if ($r['status'] === 200) {
    $reservations = $r['body']['data'] ?? $r['body']['reservations'] ?? [];
    $buyerId      = $t->userId('buyer');
    $allOwn       = true;
    foreach ($reservations as $res) {
        if (((int) ($res['user_id'] ?? 0)) !== $buyerId) {
            $allOwn = false;
            break;
        }
    }
    $t->assertTrue('R18: buyer reservations scoped to self', $allOwn, 'found reservation not belonging to buyer');
} else {
    $t->skip('R18: buyer reservations scoped', "HTTP {$r['status']}");
}

// Agent cannot access admin analytics or user management
$r = $t->get('audit-logs.php', $t->token('agent'));
$t->assertStatusIn('R19: agent view audit logs → denied', $r, [401, 403]);

/* ──────────────────────────────────────────────────────────
   Teardown & Summary
   ────────────────────────────────────────────────────────── */

// Cleanup extra users
if ($buyer2Id > 0) {
    $t->delete("users.php?id={$buyer2Id}", $t->token('admin'));
}
$seller2Id = (int) ($seller2Reg['body']['data']['id'] ?? $seller2Reg['body']['user']['id'] ?? 0);
if ($seller2Id > 0) {
    $t->delete("users.php?id={$seller2Id}", $t->token('admin'));
}

$t->teardown();
exit($t->printSummary());
