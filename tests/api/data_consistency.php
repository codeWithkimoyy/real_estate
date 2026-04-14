<?php

declare(strict_types=1);

/**
 * Data Consistency Tests — Referential integrity, state machines & concurrency
 *
 * Covers:
 *  - Foreign key / referential integrity guards
 *  - State machine transition validation
 *  - Business rule enforcement (self-transaction, duplicate reservation)
 *  - Concurrent request safety
 *  - Soft-delete data visibility
 *
 * Run:
 *   TEST_ADMIN_EMAIL=admin@example.com TEST_ADMIN_PASSWORD=secret \
 *   php tests/api/data_consistency.php
 */

require_once __DIR__ . '/helpers/TestHarness.php';

$t = new TestHarness();

fwrite(STDOUT, "=== Data Consistency Tests ===\n\n");

/* ──────────────────────────────────────────────────────────
   Phase 1: Provisioning
   ────────────────────────────────────────────────────────── */

fwrite(STDOUT, "--- Provisioning test users ---\n");
$t->provisionUsers();

fwrite(STDOUT, "\n--- Seeding data ---\n");
$propertyId    = $t->seedProperty();
$pendingPropId = $t->seedPendingProperty();

fwrite(STDOUT, "\n--- Running tests ---\n\n");

/* ══════════════════════════════════════════════════════════
   SECTION 1: Referential Integrity Guards
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "-- Referential Integrity --\n");

// D01 — Payment with non-existent property
$r = $t->post('payments.php', $t->token('buyer'), [
    'property_id'    => 999999,
    'amount'         => 50000,
    'payment_method' => 'gcash',
    'payment_type'   => 'reservation',
]);
$t->assertStatusIn('D01: payment for non-existent property → rejected', $r, [400, 404, 422]);

// D02 — Reservation for pending (unapproved) property
$r = $t->post('reservations.php', $t->token('buyer'), [
    'property_id'   => $pendingPropId,
    'duration_days' => 7,
    'notes'         => 'Should fail — unapproved property',
]);
$t->assertStatusIn('D02: reservation for pending property → rejected', $r, [400, 403, 404, 422]);

// D03 — Buyer pays for own property (self-transaction)
// Seller is the property owner, so use seller's token
$r = $t->post('payments.php', $t->token('seller'), [
    'property_id'    => $propertyId,
    'amount'         => 50000,
    'payment_method' => 'gcash',
    'payment_type'   => 'reservation',
]);
$t->assertStatusIn('D03: owner pays for own property → rejected', $r, [400, 403, 422]);

// D04 — Duplicate active reservation on same property
$resId = $t->seedReservation($propertyId);
if ($resId > 0) {
    // Try a second reservation on same property by same buyer
    $r = $t->post('reservations.php', $t->token('buyer'), [
        'property_id'   => $propertyId,
        'duration_days' => 7,
        'notes'         => 'Duplicate attempt',
    ]);
    $t->assertStatusIn('D04: duplicate active reservation → rejected', $r, [400, 409, 422]);
} else {
    $t->skip('D04: duplicate active reservation', 'first reservation failed');
}

// D05 — Soft-deleted property: existing references remain queryable
// Admin soft-deletes the pending property, buyer checks their data isn't broken
$t->delete("properties.php?id={$pendingPropId}", $t->token('admin'));

// After soft-delete, GET properties list should not include it
$r = $t->get('properties.php', $t->token('buyer'));
if ($r['status'] === 200) {
    $props       = $r['body']['data'] ?? $r['body']['properties'] ?? [];
    $foundDeleted = false;
    foreach ($props as $p) {
        if (((int) ($p['id'] ?? 0)) === $pendingPropId) {
            $foundDeleted = true;
            break;
        }
    }
    $t->assertTrue(
        'D05: soft-deleted property hidden from buyer listing',
        !$foundDeleted,
        'soft-deleted property still visible in buyer listing'
    );
} else {
    $t->skip('D05: soft-deleted property visibility', "HTTP {$r['status']}");
}

// D06 — Refund atomicity: refund_amount + refund_reason + status must all be set
$paymentId = $t->seedPayment($propertyId);
if ($paymentId > 0) {
    $r = $t->patch("payments.php?id={$paymentId}", $t->token('admin'), [
        'status'        => 'refunded',
        'refund_amount' => 25000,
        'refund_reason' => 'Test atomicity check',
    ]);

    if ($r['status'] === 200) {
        $check = $t->get("payments.php?id={$paymentId}", $t->token('admin'));
        $data  = $check['body']['data'] ?? $check['body']['payment'] ?? [];

        $hasRefundAmount = isset($data['refund_amount']) && (int) $data['refund_amount'] === 25000;
        $hasRefundReason = isset($data['refund_reason']) && $data['refund_reason'] !== '';
        $hasRefundStatus = ($data['status'] ?? '') === 'refunded';

        $t->assertTrue(
            'D06: refund atomicity — all fields set',
            $hasRefundAmount && $hasRefundReason && $hasRefundStatus,
            sprintf(
                'amount=%s reason=%s status=%s',
                $data['refund_amount'] ?? 'null',
                $data['refund_reason'] ?? 'null',
                $data['status'] ?? 'null'
            )
        );
    } else {
        $t->skip('D06: refund atomicity', "refund PATCH returned HTTP {$r['status']}");
    }
} else {
    $t->skip('D06: refund atomicity', 'no payment seeded');
}

/* ══════════════════════════════════════════════════════════
   SECTION 2: State Machine Integrity
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- State Machine Integrity --\n");

// D07 — Valid reservation transitions: pending → active (property owner confirms)
if ($resId > 0) {
    $r = $t->patch("reservations.php?id={$resId}", $t->token('seller'), [
        'status' => 'active',
    ]);
    // Even if admin is needed, seller as owner should be able to confirm
    if ($r['status'] !== 200) {
        $r = $t->patch("reservations.php?id={$resId}", $t->token('admin'), [
            'status' => 'active',
        ]);
    }
    $t->assertStatus('D07: reservation pending → active', $r, 200);
}

// D08 — Invalid reservation rollback: completed → active
if ($resId > 0) {
    // First complete it
    $t->patch("reservations.php?id={$resId}", $t->token('admin'), ['status' => 'completed']);

    // Then try invalid rollback
    $r = $t->patch("reservations.php?id={$resId}", $t->token('admin'), [
        'status' => 'active',
    ]);
    // If the app enforces state machines, this should fail.
    // If it allows the transition, we flag it as a finding.
    if ($r['status'] === 200) {
        $t->fail('D08: completed → active allowed (state machine gap)',
            'reservation accepted invalid status rollback');
    } else {
        $t->assertStatusIn('D08: reservation completed → active → rejected', $r, [400, 422]);
    }
}

// D09 — Valid payment flow: pending → completed → refunded
$payId2 = 0;
{
    $p = $t->post('payments.php', $t->token('buyer'), [
        'property_id'    => $propertyId,
        'amount'         => 30000,
        'payment_method' => 'bank_transfer',
        'payment_type'   => 'down_payment',
    ]);
    $payId2 = (int) ($p['body']['data']['id'] ?? $p['body']['payment']['id'] ?? 0);

    if ($payId2 > 0) {
        // pending → completed
        $r = $t->patch("payments.php?id={$payId2}", $t->token('admin'), ['status' => 'completed']);
        $t->assertStatus('D09a: payment pending → completed', $r, 200);

        // completed → refunded
        $r = $t->patch("payments.php?id={$payId2}", $t->token('admin'), [
            'status'        => 'refunded',
            'refund_amount' => 30000,
            'refund_reason' => 'State machine test',
        ]);
        $t->assertStatus('D09b: payment completed → refunded', $r, 200);
    } else {
        $t->skip('D09: payment state flow', 'could not create payment');
    }
}

// D10 — Invalid payment rollback: refunded → completed
if ($payId2 > 0) {
    $r = $t->patch("payments.php?id={$payId2}", $t->token('admin'), [
        'status' => 'completed',
    ]);
    if ($r['status'] === 200) {
        $t->fail('D10: refunded → completed allowed (state machine gap)',
            'payment accepted invalid status rollback');
    } else {
        $t->assertStatusIn('D10: payment refunded → completed → rejected', $r, [400, 422]);
    }
}

// D11 — Valid property transitions: admin approves pending → approved
// Already tested implicitly via seedProperty, but verify explicitly
{
    // Create a fresh pending property
    $p = $t->post('properties.php', $t->token('seller'), [
        'title'         => 'State Machine Test Prop ' . bin2hex(random_bytes(2)),
        'description'   => 'For state machine testing',
        'price'         => 2000000,
        'property_type' => 'lot',
        'listing_type'  => 'sale',
        'bedrooms'      => 0,
        'bathrooms'     => 0,
        'area_sqm'      => 150,
        'address'       => '789 Test Blvd',
        'city'          => 'Makati',
        'province'      => 'Metro Manila',
    ]);
    $smPropId = (int) ($p['body']['data']['id'] ?? $p['body']['property']['id'] ?? 0);

    if ($smPropId > 0) {
        $r = $t->patch("properties.php?id={$smPropId}&action=approve", $t->token('admin'));
        $t->assertStatus('D11: property pending → approved', $r, 200);

        // Clean up
        $t->delete("properties.php?id={$smPropId}", $t->token('admin'));
    } else {
        $t->skip('D11: property state transition', 'could not create property');
    }
}

// D12 — Invalid property rollback: sold → pending
// This requires a property that's been marked as sold
// We'll test by attempting to patch an approved property to 'sold' then back to 'pending'
if ($propertyId > 0) {
    // Try setting to 'pending' on an approved property (invalid rollback)
    $r = $t->patch("properties.php?id={$propertyId}", $t->token('admin'), [
        'status' => 'pending',
    ]);
    // If the app doesn't enforce status transitions, this is a finding
    if ($r['status'] === 200) {
        // Check if status actually changed
        $check  = $t->get("properties.php?id={$propertyId}", $t->token('admin'));
        $status = $check['body']['data']['status'] ?? $check['body']['property']['status'] ?? '';
        if ($status === 'pending') {
            $t->fail('D12: approved → pending allowed (state machine gap)',
                'property accepted status rollback');
            // Restore
            $t->patch("properties.php?id={$propertyId}&action=approve", $t->token('admin'));
        } else {
            $t->pass('D12: property status rollback silently ignored');
        }
    } else {
        $t->assertStatusIn('D12: property approved → pending → rejected', $r, [400, 422]);
    }
}

/* ══════════════════════════════════════════════════════════
   SECTION 3: Concurrency Safety
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- Concurrency Safety --\n");

// D13 — Parallel reservation creation for same property
// Cancel existing reservation first to free the property
if ($resId > 0) {
    $t->patch("reservations.php?id={$resId}", $t->token('admin'), ['status' => 'cancelled']);
}

// Create a second buyer for the race
$suffix4     = bin2hex(random_bytes(4));
$racer1Email = "test_racer1_{$suffix4}@estateflow-test.local";
$racer1Phone = '09' . str_pad((string) rand(100000000, 999999999), 9, '0');
$racer1Reg   = $t->post('auth.php?action=register', null, [
    'first_name' => 'Racer',
    'last_name'  => 'One',
    'email'      => $racer1Email,
    'phone'      => $racer1Phone,
    'password'   => 'TestPass123!',
    'role'       => 'buyer',
]);
$racer1Token = $racer1Reg['body']['token']
    ?? $racer1Reg['body']['data']['token']
    ?? $racer1Reg['body']['session']['token']
    ?? '';
$racer1Id = (int) ($racer1Reg['body']['data']['id'] ?? $racer1Reg['body']['user']['id'] ?? 0);

if ($racer1Token !== '' && $propertyId > 0) {
    // Use curl_multi to fire both reservation requests simultaneously
    $results = parallel_requests($t, [
        [
            'method' => 'POST',
            'path'   => 'reservations.php',
            'token'  => $t->token('buyer'),
            'body'   => ['property_id' => $propertyId, 'duration_days' => 5, 'notes' => 'Racer Buyer1'],
        ],
        [
            'method' => 'POST',
            'path'   => 'reservations.php',
            'token'  => $racer1Token,
            'body'   => ['property_id' => $propertyId, 'duration_days' => 5, 'notes' => 'Racer Buyer2'],
        ],
    ]);

    $successes = 0;
    foreach ($results as $r) {
        if (($r['status'] ?? 0) === 200 || ($r['status'] ?? 0) === 201) {
            $successes++;
        }
    }

    if ($successes <= 1) {
        $t->pass("D13: parallel reservation → at most 1 succeeded ({$successes})");
    } else {
        $t->fail('D13: parallel reservation → both succeeded (race condition)', "successes={$successes}");
    }
} else {
    $t->skip('D13: parallel reservation', 'missing tokens or property');
}

// D14 — Parallel payment status updates
$payRace = $t->post('payments.php', $t->token('buyer'), [
    'property_id'    => $propertyId,
    'amount'         => 10000,
    'payment_method' => 'cash',
    'payment_type'   => 'reservation',
]);
$payRaceId = (int) ($payRace['body']['data']['id'] ?? $payRace['body']['payment']['id'] ?? 0);

if ($payRaceId > 0) {
    $results = parallel_requests($t, [
        [
            'method' => 'PATCH',
            'path'   => "payments.php?id={$payRaceId}",
            'token'  => $t->token('admin'),
            'body'   => ['status' => 'completed'],
        ],
        [
            'method' => 'PATCH',
            'path'   => "payments.php?id={$payRaceId}",
            'token'  => $t->token('admin'),
            'body'   => ['status' => 'failed'],
        ],
    ]);

    // Verify final state is consistent (one of the two, not a mix)
    $check  = $t->get("payments.php?id={$payRaceId}", $t->token('admin'));
    $status = $check['body']['data']['status'] ?? $check['body']['payment']['status'] ?? '';
    $t->assertTrue(
        'D14: concurrent payment updates → final state consistent',
        in_array($status, ['completed', 'failed', 'pending'], true),
        "unexpected status: {$status}"
    );

    // Cleanup
    $t->delete("payments.php?id={$payRaceId}", $t->token('admin'));
} else {
    $t->skip('D14: concurrent payment updates', 'could not create payment');
}

// D15 — Register same email twice in parallel
$dupeEmail = 'dupe_' . bin2hex(random_bytes(4)) . '@estateflow-test.local';
$dupePhone1 = '09' . str_pad((string) rand(100000000, 999999999), 9, '0');
$dupePhone2 = '09' . str_pad((string) rand(100000000, 999999999), 9, '0');

$results = parallel_requests($t, [
    [
        'method' => 'POST',
        'path'   => 'auth.php?action=register',
        'token'  => null,
        'body'   => [
            'first_name' => 'Dupe', 'last_name' => 'One',
            'email' => $dupeEmail, 'phone' => $dupePhone1,
            'password' => 'TestPass123!', 'role' => 'buyer',
        ],
    ],
    [
        'method' => 'POST',
        'path'   => 'auth.php?action=register',
        'token'  => null,
        'body'   => [
            'first_name' => 'Dupe', 'last_name' => 'Two',
            'email' => $dupeEmail, 'phone' => $dupePhone2,
            'password' => 'TestPass123!', 'role' => 'buyer',
        ],
    ],
]);

$regSuccesses = 0;
$dupeUserId   = 0;
foreach ($results as $r) {
    $s = $r['status'] ?? 0;
    if ($s === 200 || $s === 201) {
        $regSuccesses++;
        $dupeUserId = (int) ($r['body']['data']['id'] ?? $r['body']['user']['id'] ?? 0);
    }
}

if ($regSuccesses <= 1) {
    $t->pass("D15: parallel duplicate registration → at most 1 succeeded ({$regSuccesses})");
} else {
    $t->fail('D15: parallel duplicate registration → both succeeded (race)', "successes={$regSuccesses}");
}

/* ══════════════════════════════════════════════════════════
   SECTION 4: Boundary Value & Edge Cases
   ══════════════════════════════════════════════════════════ */

fwrite(STDOUT, "\n-- Boundary Values & Edge Cases --\n");

// D16 — Reservation with 0-day duration
$r = $t->post('reservations.php', $t->token('buyer'), [
    'property_id'   => $propertyId,
    'duration_days' => 0,
]);
$t->assertStatusIn('D16: 0-day reservation → rejected', $r, [400, 422]);

// D17 — Reservation exceeding 90-day max
$r = $t->post('reservations.php', $t->token('buyer'), [
    'property_id'   => $propertyId,
    'duration_days' => 365,
]);
$t->assertStatusIn('D17: 365-day reservation → rejected', $r, [400, 422]);

// D18 — Payment with negative amount
$r = $t->post('payments.php', $t->token('buyer'), [
    'property_id'    => $propertyId,
    'amount'         => -50000,
    'payment_method' => 'gcash',
    'payment_type'   => 'reservation',
]);
$t->assertStatusIn('D18: negative payment amount → rejected', $r, [400, 422]);

// D19 — Payment with zero amount
$r = $t->post('payments.php', $t->token('buyer'), [
    'property_id'    => $propertyId,
    'amount'         => 0,
    'payment_method' => 'gcash',
    'payment_type'   => 'reservation',
]);
$t->assertStatusIn('D19: zero payment amount → rejected', $r, [400, 422]);

// D20 — Property with negative price
$r = $t->post('properties.php', $t->token('seller'), [
    'title'         => 'Negative Price',
    'description'   => 'Should fail',
    'price'         => -1,
    'property_type' => 'house',
    'listing_type'  => 'sale',
    'bedrooms'      => 1,
    'bathrooms'     => 1,
    'area_sqm'      => 50,
    'address'       => '123 Invalid',
    'city'          => 'Manila',
    'province'      => 'Metro Manila',
]);
$t->assertStatusIn('D20: negative property price → rejected', $r, [400, 422]);

/* ──────────────────────────────────────────────────────────
   Teardown & Summary
   ────────────────────────────────────────────────────────── */

// Cleanup extra users
if ($racer1Id > 0) {
    $t->delete("users.php?id={$racer1Id}", $t->token('admin'));
}
if ($dupeUserId > 0) {
    $t->delete("users.php?id={$dupeUserId}", $t->token('admin'));
}
if ($payId2 > 0) {
    $t->delete("payments.php?id={$payId2}", $t->token('admin'));
}

$t->teardown();
exit($t->printSummary());


/* ══════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════ */

/**
 * Fire multiple HTTP requests in parallel using curl_multi.
 *
 * @param TestHarness $t
 * @param list<array{method: string, path: string, token: ?string, body: ?array}> $requests
 * @return list<array{status: int, body: array}>
 */
function parallel_requests(TestHarness $t, array $requests): array
{
    $baseUrl = rtrim(
        (string) (getenv('API_BASE_URL') ?: 'http://localhost/Activities/real_estate/api'),
        '/'
    );

    $mh      = curl_multi_init();
    $handles = [];

    foreach ($requests as $i => $req) {
        $url = $baseUrl . '/' . ltrim($req['path'], '/');
        $ch  = curl_init($url);
        if ($ch === false) {
            continue;
        }

        $headers = ['Accept: application/json'];
        if (!empty($req['token'])) {
            $headers[] = 'Authorization: Bearer ' . $req['token'];
        }
        if (!empty($req['body'])) {
            $headers[] = 'Content-Type: application/json';
        }

        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $req['method'],
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 15,
        ];
        if (!empty($req['body'])) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($req['body'], JSON_THROW_ON_ERROR);
        }
        curl_setopt_array($ch, $opts);

        curl_multi_add_handle($mh, $ch);
        $handles[$i] = $ch;
    }

    // Execute all simultaneously
    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh);
    } while ($running > 0);

    $results = [];
    foreach ($handles as $i => $ch) {
        $raw    = curl_multi_getcontent($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $json   = json_decode((string) $raw, true);

        $results[$i] = [
            'status' => $status,
            'body'   => is_array($json) ? $json : [],
        ];

        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }

    curl_multi_close($mh);
    return $results;
}
