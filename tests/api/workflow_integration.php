<?php

declare(strict_types=1);

/**
 * Workflow Integration Tests — Real user journeys across roles
 *
 * Simulates realistic multi-step flows:
 *  W1: Buyer Journey   — browse → favorite → reserve → pay → view payment
 *  W2: Seller Journey  — create listing → admin approves → confirm reservation → view payment
 *  W3: Admin Journey   — approve property → verify user → review payment → resolve dispute
 *  W4: Clerk Journey   — list users → view appointments → view reservations
 *
 * Run:
 *   TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=secret \
 *   php tests/api/workflow_integration.php
 */

require_once __DIR__ . '/helpers/TestHarness.php';

$t = new TestHarness();

fwrite(STDOUT, "=== Workflow Integration Tests ===\n\n");

$t->clearRateLimits();

/* ──────────────────────────────────────────────────────────
   Phase 1: Provision Users
   ────────────────────────────────────────────────────────── */

fwrite(STDOUT, "--- Provisioning test users ---\n");
$t->provisionUsers();

/* ──────────────────────────────────────────────────────────
   Phase 2: Admin verifies the seller so they can list
   ────────────────────────────────────────────────────────── */

fwrite(STDOUT, "\n--- Setup: Admin verifies seller ---\n");

$r = $t->patch('users.php?id=' . $t->userId('seller'), $t->token('admin'), [
    'verificationAction' => 'verify',
    'verification_notes' => 'Workflow test auto-verify',
]);
$t->assertStatusIn('SETUP: admin verifies seller', $r, [200, 422]);

/* ══════════════════════════════════════════════════════════
   W1: SELLER JOURNEY — List a property
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W1: Seller Creates Listing ==\n");

// W1.01 — Seller creates a new property listing
$r = $t->post('properties.php', $t->token('seller'), [
    'title'        => 'Workflow Test House ' . bin2hex(random_bytes(3)),
    'description'  => 'A beautiful house for workflow testing',
    'price'        => 4500000,
    'propertyType' => 'house',
    'beds'         => 3,
    'baths'        => 2,
    'sqm'          => 150,
    'address'      => '789 Workflow Street',
    'city'         => 'Makati',
    'province'     => 'Metro Manila',
]);
$t->assertStatusIn('W1.01: seller creates property → 201', $r, [200, 201]);
$propertyId = (int) ($r['body']['data']['id'] ?? $r['body']['property']['id'] ?? 0);
$t->assertTrue('W1.01: property ID returned', $propertyId > 0, "got id=$propertyId");

// W1.02 — Seller can view their own pending listing
$r = $t->get("properties.php?id={$propertyId}", $t->token('seller'));
$t->assertStatus('W1.02: seller views own pending property → 200', $r, 200);
$viewedId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W1.02: property detail has ID', $viewedId === $propertyId, "expected id=$propertyId, got $viewedId");

// W1.03 — Property starts in pending status
$status = $r['body']['data']['status'] ?? $r['body']['property']['status'] ?? '';
$t->assertTrue('W1.03: property status is pending', $status === 'pending', "got status=$status");

/* ══════════════════════════════════════════════════════════
   W2: ADMIN JOURNEY — Approve the listing
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W2: Admin Approves Listing ==\n");

// W2.01 — Admin approves the property
$r = $t->patch("properties.php?id={$propertyId}&action=approve", $t->token('admin'));
$t->assertStatusIn('W2.01: admin approves property → 200', $r, [200]);

// W2.02 — Property is now approved
$r = $t->get("properties.php?id={$propertyId}", $t->token('admin'));
$t->assertStatus('W2.02: admin views approved property → 200', $r, 200);
$viewedId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W2.02: approved property has ID', $viewedId === $propertyId, "expected id=$propertyId, got $viewedId");
$status = $r['body']['data']['status'] ?? $r['body']['property']['status'] ?? '';
$t->assertTrue('W2.02: property status is approved', $status === 'approved', "got status=$status");

/* ══════════════════════════════════════════════════════════
   W3: BUYER JOURNEY — Browse → Favorite → Reserve → Pay
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W3: Buyer Journey ==\n");

// W3.01 — Buyer browses properties (public listing)
$r = $t->get('properties.php', $t->token('buyer'));
$t->assertStatus('W3.01: buyer lists properties → 200', $r, 200);
$listings = $r['body']['data'] ?? [];
$t->assertTrue('W3.01: listings returned', count($listings) > 0, 'no properties found');

// W3.02 — Buyer views the specific approved property
$r = $t->get("properties.php?id={$propertyId}", $t->token('buyer'));
$t->assertStatus('W3.02: buyer views property detail → 200', $r, 200);
$viewedId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W3.02: property detail has ID', $viewedId === $propertyId, "expected id=$propertyId, got $viewedId");

// W3.03 — Buyer adds property to favorites
$r = $t->post('favorites.php', $t->token('buyer'), [
    'propertyId' => $propertyId,
]);
$t->assertStatusIn('W3.03: buyer favorites property → 200', $r, [200]);
$favPropertyId = (int) ($r['body']['data']['propertyId'] ?? 0);
$t->assertTrue('W3.03: favorite response has propertyId', $favPropertyId === $propertyId, "expected propertyId=$propertyId, got $favPropertyId");

// W3.04 — Buyer can see it in their favorites list
$r = $t->get('favorites.php', $t->token('buyer'));
$t->assertStatus('W3.04: buyer lists favorites → 200', $r, 200);
$favs = $r['body']['data'] ?? [];
$foundFav = false;
$allFavsHaveId = true;
foreach ($favs as $fav) {
    if (!isset($fav['id']) || (int) $fav['id'] <= 0) {
        $allFavsHaveId = false;
    }
    if (($fav['propertyId'] ?? 0) === $propertyId) {
        $foundFav = true;
    }
}
$t->assertTrue('W3.04: all favorites have IDs', $allFavsHaveId, 'found favorite without id');
$t->assertTrue('W3.04: favorited property appears in list', $foundFav, 'property not in favorites');

// W3.05 — Buyer reserves the property
$r = $t->post('reservations.php', $t->token('buyer'), [
    'propertyId' => $propertyId,
    'days'       => 14,
    'notes'      => 'Interested in purchasing, workflow test',
]);
$t->assertStatusIn('W3.05: buyer reserves property → 201', $r, [200, 201]);
$reservationId = (int) ($r['body']['data']['id'] ?? $r['body']['reservation']['id'] ?? 0);
$t->assertTrue('W3.05: reservation ID returned', $reservationId > 0, "got id=$reservationId");

// W3.06 — Reservation status is pending
$r2 = $t->get("reservations.php?id={$reservationId}", $t->token('buyer'));
$reservationStatus = $r2['body']['data']['status'] ?? '';
$t->assertTrue('W3.06: reservation is pending', $reservationStatus === 'pending', "got status=$reservationStatus");

// W3.07 — Buyer can view their reservation
$r = $t->get("reservations.php?id={$reservationId}", $t->token('buyer'));
$t->assertStatus('W3.07: buyer views reservation → 200', $r, 200);
$viewedResId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W3.07: reservation detail has ID', $viewedResId === $reservationId, "expected id=$reservationId, got $viewedResId");

// W3.08 — Buyer cannot duplicate-reserve the same property
$r = $t->post('reservations.php', $t->token('buyer'), [
    'propertyId' => $propertyId,
    'days'       => 7,
]);
$t->assertStatusIn('W3.08: duplicate reservation → rejected', $r, [409, 422]);

/* ══════════════════════════════════════════════════════════
   W4: SELLER CONFIRMS RESERVATION
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W4: Seller Confirms Reservation ==\n");

// W4.01 — Seller sees the reservation on their property
$r = $t->get("reservations.php?property_id={$propertyId}", $t->token('seller'));
$t->assertStatus('W4.01: seller views property reservations → 200', $r, 200);
$resList = $r['body']['data'] ?? [];
$t->assertTrue('W4.01: reservation visible to seller', count($resList) > 0, 'no reservations found');
if (count($resList) > 0) {
    $allResHaveId = true;
    foreach ($resList as $res) {
        if (!isset($res['id']) || (int) $res['id'] <= 0) { $allResHaveId = false; break; }
    }
    $t->assertTrue('W4.01: all listed reservations have IDs', $allResHaveId, 'found reservation without id');
}

// W4.02 — Seller confirms (activates) the reservation
$r = $t->patch("reservations.php?id={$reservationId}", $t->token('seller'), [
    'status' => 'active',
]);
$t->assertStatusIn('W4.02: seller confirms reservation → 200', $r, [200]);

// W4.03 — Reservation is now active
$r = $t->get("reservations.php?id={$reservationId}", $t->token('buyer'));
$activeStatus = $r['body']['data']['status'] ?? '';
$t->assertTrue('W4.03: reservation status is active', $activeStatus === 'active', "got status=$activeStatus");

/* ══════════════════════════════════════════════════════════
   W5: BUYER MAKES PAYMENT
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W5: Buyer Makes Payment ==\n");

// W5.01 — Buyer submits a reservation payment
$r = $t->post('payments.php', $t->token('buyer'), [
    'propertyId'    => $propertyId,
    'amount'        => 50000,
    'paymentMethod' => 'gcash',
    'paymentType'   => 'reservation',
    'referenceNo'   => 'WF-' . bin2hex(random_bytes(4)),
    'notes'         => 'Reservation payment via GCash',
]);
$t->assertStatusIn('W5.01: buyer submits payment → 201', $r, [200, 201]);
$paymentId = (int) ($r['body']['data']['id'] ?? $r['body']['payment']['id'] ?? 0);
$t->assertTrue('W5.01: payment ID returned', $paymentId > 0, "got id=$paymentId");

// W5.02 — Payment starts as pending
$r = $t->get("payments.php?id={$paymentId}", $t->token('buyer'));
$t->assertStatus('W5.02: buyer views payment → 200', $r, 200);
$viewedPayId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W5.02: payment detail has ID', $viewedPayId === $paymentId, "expected id=$paymentId, got $viewedPayId");
$payStatus = $r['body']['data']['status'] ?? '';
$t->assertTrue('W5.02: payment status is pending', $payStatus === 'pending', "got status=$payStatus");

// W5.03 — Buyer can see payment in their list
$r = $t->get('payments.php', $t->token('buyer'));
$t->assertStatus('W5.03: buyer lists payments → 200', $r, 200);
$payList = $r['body']['data'] ?? [];
$foundPay = false;
$allPaysHaveId = true;
foreach ($payList as $p) {
    if (!isset($p['id']) || (int) $p['id'] <= 0) {
        $allPaysHaveId = false;
    }
    if (($p['id'] ?? 0) === $paymentId) {
        $foundPay = true;
    }
}
$t->assertTrue('W5.03: all payments have IDs', $allPaysHaveId, 'found payment without id');
$t->assertTrue('W5.03: payment appears in buyer list', $foundPay, 'payment not in list');

// W5.04 — Seller can also see the payment
$r = $t->get("payments.php?id={$paymentId}", $t->token('seller'));
$t->assertStatus('W5.04: seller views buyer payment → 200', $r, 200);
$sellerPayId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W5.04: seller payment detail has ID', $sellerPayId === $paymentId, "expected id=$paymentId, got $sellerPayId");

/* ══════════════════════════════════════════════════════════
   W6: BUYER SCHEDULES APPOINTMENT
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W6: Buyer Schedules Appointment ==\n");

$futureDate = date('Y-m-d', strtotime('+3 days'));

// W6.01 — Buyer books a viewing appointment
$r = $t->post('appointments.php', $t->token('buyer'), [
    'propertyId'      => $propertyId,
    'appointmentDate' => $futureDate,
    'appointmentTime' => '14:00',
    'appointmentType' => 'viewing',
    'notes'           => 'Would like to see the property in person',
]);
$t->assertStatusIn('W6.01: buyer books appointment → 201', $r, [200, 201]);
$appointmentId = (int) ($r['body']['data']['id'] ?? $r['body']['appointment']['id'] ?? 0);
$t->assertTrue('W6.01: appointment ID returned', $appointmentId > 0, "got id=$appointmentId");

// W6.02 — Buyer sees appointment in their list
$r = $t->get('appointments.php', $t->token('buyer'));
$t->assertStatus('W6.02: buyer lists appointments → 200', $r, 200);
$apptList = $r['body']['data'] ?? [];
$allApptsHaveId = true;
$foundAppt = false;
foreach ($apptList as $a) {
    if (!isset($a['id']) || (int) $a['id'] <= 0) { $allApptsHaveId = false; }
    if (($a['id'] ?? 0) === $appointmentId) { $foundAppt = true; }
}
$t->assertTrue('W6.02: all appointments have IDs', $allApptsHaveId, 'found appointment without id');
$t->assertTrue('W6.02: appointment appears in buyer list', $foundAppt, 'appointment not in list');

/* ══════════════════════════════════════════════════════════
   W7: ADMIN REVIEWS PAYMENT & MANAGES DISPUTE
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W7: Admin Reviews & Manages ==\n");

// W7.01 — Admin can see all payments (every item must have an ID)
$r = $t->get('payments.php', $t->token('admin'));
$t->assertStatus('W7.01: admin lists all payments → 200', $r, 200);
$adminPays = $r['body']['data'] ?? [];
$allAdminPaysHaveId = true;
foreach ($adminPays as $p) {
    if (!isset($p['id']) || (int) $p['id'] <= 0) { $allAdminPaysHaveId = false; break; }
}
$t->assertTrue('W7.01: all admin-listed payments have IDs', $allAdminPaysHaveId, 'found payment without id');

// W7.02 — Admin can view the specific payment
$r = $t->get("payments.php?id={$paymentId}", $t->token('admin'));
$t->assertStatus('W7.02: admin views payment detail → 200', $r, 200);
$adminPayId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W7.02: admin payment detail has ID', $adminPayId === $paymentId, "expected id=$paymentId, got $adminPayId");

// W7.03 — Admin can view all reservations (every item must have an ID)
$r = $t->get('reservations.php', $t->token('admin'));
$t->assertStatus('W7.03: admin lists reservations → 200', $r, 200);
$adminRes = $r['body']['data'] ?? [];
$allAdminResHaveId = true;
foreach ($adminRes as $res) {
    if (!isset($res['id']) || (int) $res['id'] <= 0) { $allAdminResHaveId = false; break; }
}
$t->assertTrue('W7.03: all admin-listed reservations have IDs', $allAdminResHaveId, 'found reservation without id');

// W7.04 — Admin can view all appointments (every item must have an ID)
$r = $t->get('appointments.php', $t->token('admin'));
$t->assertStatus('W7.04: admin lists appointments → 200', $r, 200);
$adminAppts = $r['body']['data'] ?? [];
$allAdminApptsHaveId = true;
foreach ($adminAppts as $a) {
    if (!isset($a['id']) || (int) $a['id'] <= 0) { $allAdminApptsHaveId = false; break; }
}
$t->assertTrue('W7.04: all admin-listed appointments have IDs', $allAdminApptsHaveId, 'found appointment without id');

// W7.05 — Admin views audit logs (should contain our actions)
$r = $t->get('audit-logs.php', $t->token('admin'));
$t->assertStatus('W7.05: admin views audit logs → 200', $r, 200);

/* ══════════════════════════════════════════════════════════
   W8: CLERK JOURNEY — Oversight tasks
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W8: Clerk Journey ==\n");

// W8.01 — Clerk lists users (every user must have an ID)
$r = $t->get('users.php', $t->token('clerk'));
$t->assertStatus('W8.01: clerk lists users → 200', $r, 200);
$clerkUsers = $r['body']['data'] ?? [];
$allUsersHaveId = true;
foreach ($clerkUsers as $u) {
    if (!isset($u['id']) || (int) $u['id'] <= 0) { $allUsersHaveId = false; break; }
}
$t->assertTrue('W8.01: all clerk-listed users have IDs', $allUsersHaveId, 'found user without id');

// W8.02 — Clerk views reservations (every item must have an ID)
$r = $t->get('reservations.php', $t->token('clerk'));
$t->assertStatus('W8.02: clerk lists reservations → 200', $r, 200);
$clerkRes = $r['body']['data'] ?? [];
$allClerkResHaveId = true;
foreach ($clerkRes as $res) {
    if (!isset($res['id']) || (int) $res['id'] <= 0) { $allClerkResHaveId = false; break; }
}
$t->assertTrue('W8.02: all clerk-listed reservations have IDs', $allClerkResHaveId, 'found reservation without id');

// W8.03 — Clerk views appointments (every item must have an ID)
$r = $t->get('appointments.php', $t->token('clerk'));
$t->assertStatus('W8.03: clerk lists appointments → 200', $r, 200);
$clerkAppts = $r['body']['data'] ?? [];
$allClerkApptsHaveId = true;
foreach ($clerkAppts as $a) {
    if (!isset($a['id']) || (int) $a['id'] <= 0) { $allClerkApptsHaveId = false; break; }
}
$t->assertTrue('W8.03: all clerk-listed appointments have IDs', $allClerkApptsHaveId, 'found appointment without id');

// W8.04 — Clerk views the specific property
$r = $t->get("properties.php?id={$propertyId}", $t->token('clerk'));
$t->assertStatus('W8.04: clerk views property → 200', $r, 200);
$clerkPropId = (int) ($r['body']['data']['id'] ?? 0);
$t->assertTrue('W8.04: clerk property detail has ID', $clerkPropId === $propertyId, "expected id=$propertyId, got $clerkPropId");

// W8.05 — Clerk views notifications
$r = $t->get('notifications.php', $t->token('clerk'));
$t->assertStatus('W8.05: clerk notifications → 200', $r, 200);

/* ══════════════════════════════════════════════════════════
   W9: BUYER REMOVES FAVORITE (clean up)
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W9: Buyer Removes Favorite ==\n");

// W9.01 — Buyer unfavorites
$r = $t->delete("favorites.php?propertyId={$propertyId}", $t->token('buyer'));
$t->assertStatusIn('W9.01: buyer removes favorite → 200', $r, [200]);

// W9.02 — Property no longer in favorites
$r = $t->get('favorites.php', $t->token('buyer'));
$favs = $r['body']['data'] ?? [];
$stillFav = false;
foreach ($favs as $fav) {
    if (($fav['propertyId'] ?? 0) === $propertyId) {
        $stillFav = true;
        break;
    }
}
$t->assertTrue('W9.02: property removed from favorites', !$stillFav, 'property still in favorites');

/* ══════════════════════════════════════════════════════════
   W10: NEGATIVE FLOW — Boundary checks within workflow
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n== W10: Negative Flow Checks ==\n");

// W10.01 — Seller cannot reserve their own property
$r = $t->post('reservations.php', $t->token('seller'), [
    'propertyId' => $propertyId,
    'days'       => 7,
]);
$t->assertStatusIn('W10.01: seller self-reserve → rejected', $r, [409, 422]);

// W10.02 — Seller cannot pay for their own property
$r = $t->post('payments.php', $t->token('seller'), [
    'propertyId'    => $propertyId,
    'amount'        => 100000,
    'paymentMethod' => 'gcash',
    'paymentType'   => 'reservation',
]);
$t->assertStatusIn('W10.02: seller self-pay → rejected', $r, [422]);

// W10.03 — Buyer cannot approve the property
$r = $t->patch("properties.php?id={$propertyId}&action=approve", $t->token('buyer'));
$t->assertStatusIn('W10.03: buyer approve property → denied', $r, [401, 403, 422]);

// W10.04 — Invalid payment method rejected
$r = $t->post('payments.php', $t->token('buyer'), [
    'propertyId'    => $propertyId,
    'amount'        => 50000,
    'paymentMethod' => 'bitcoin',
    'paymentType'   => 'reservation',
]);
$t->assertStatusIn('W10.04: invalid payment method → 422', $r, [422]);

// W10.05 — Zero amount payment rejected
$r = $t->post('payments.php', $t->token('buyer'), [
    'propertyId'    => $propertyId,
    'amount'        => 0,
    'paymentMethod' => 'gcash',
    'paymentType'   => 'reservation',
]);
$t->assertStatusIn('W10.05: zero amount → 422', $r, [422]);

// W10.06 — Reservation with invalid days rejected
$r = $t->post('reservations.php', $t->token('buyer'), [
    'propertyId' => $propertyId,
    'days'       => 100,
]);
$t->assertStatusIn('W10.06: days > 90 → 422', $r, [422]);

/* ──────────────────────────────────────────────────────────
   Teardown & Summary
   ────────────────────────────────────────────────────────── */

// Clean up in reverse order (appointments, payments, reservations, favorites, property, users)
fwrite(STDOUT, "\n--- Manual cleanup ---\n");

if ($appointmentId > 0) {
    $r = $t->delete("appointments.php?id={$appointmentId}", $t->token('admin'));
    fwrite(STDOUT, "  Cleanup appointment #{$appointmentId}: HTTP {$r['status']}\n");
}
if ($paymentId > 0) {
    $r = $t->delete("payments.php?id={$paymentId}", $t->token('admin'));
    fwrite(STDOUT, "  Cleanup payment #{$paymentId}: HTTP {$r['status']}\n");
}
if ($reservationId > 0) {
    $r = $t->delete("reservations.php?id={$reservationId}", $t->token('admin'));
    fwrite(STDOUT, "  Cleanup reservation #{$reservationId}: HTTP {$r['status']}\n");
}
if ($propertyId > 0) {
    $r = $t->delete("properties.php?id={$propertyId}", $t->token('admin'));
    fwrite(STDOUT, "  Cleanup property #{$propertyId}: HTTP {$r['status']}\n");
}

$t->teardown();
exit($t->printSummary());
