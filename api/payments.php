<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = require_auth($mysqli);

function build_payment_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'propertyId' => (int) $row['property_id'],
        'propertyTitle' => (string) ($row['property_title'] ?? ''),
        'propertyImage' => (string) ($row['property_image'] ?? ''),
        'reservationId' => isset($row['reservation_id']) && $row['reservation_id'] !== null ? (int) $row['reservation_id'] : null,
        'buyerId' => (int) $row['buyer_id'],
        'buyerName' => (string) ($row['buyer_name'] ?? ''),
        'sellerId' => (int) $row['seller_id'],
        'sellerName' => (string) ($row['seller_name'] ?? ''),
        'amount' => (int) $row['amount'],
        'paymentChannel' => (string) ($row['payment_channel'] ?? 'online'),
        'paymentMethod' => (string) $row['payment_method'],
        'paymentType' => (string) $row['payment_type'],
        'referenceNo' => $row['reference_no'] ? (string) $row['reference_no'] : null,
        'status' => (string) $row['status'],
        'notes' => $row['notes'] ? (string) $row['notes'] : null,
        'proofUrl' => $row['proof_url'] ? (string) $row['proof_url'] : null,
        'reviewedBy' => isset($row['reviewed_by']) && $row['reviewed_by'] ? (int) $row['reviewed_by'] : null,
        'reviewedAt' => $row['reviewed_at'] ?? null,
        'refundAmount' => isset($row['refund_amount']) ? (int) $row['refund_amount'] : null,
        'refundReason' => $row['refund_reason'] ?? null,
        'createdAt' => (string) $row['created_at'],
        'updatedAt' => (string) $row['updated_at'],
    ];
}

function generate_payment_reference(string $prefix = 'PAY'): string
{
    return strtoupper($prefix) . '-' . date('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
}

function activate_reservation_from_paid_payment(mysqli $mysqli, array $payment): void
{
    $reservationId = (int) ($payment['reservation_id'] ?? 0);
    if ($reservationId <= 0) {
        return;
    }

    $reservationStmt = $mysqli->prepare('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $reservationStmt->bind_param('i', $reservationId);
    $reservationStmt->execute();
    $reservation = $reservationStmt->get_result()->fetch_assoc();
    if (!$reservation) {
        return;
    }

    $paymentType = (string) ($payment['payment_type'] ?? 'reservation');
    $propertyId = (int) $reservation['property_id'];

    if (in_array($paymentType, ['reservation', 'down_payment'], true) && (string) $reservation['status'] === 'pending') {
        $activateStmt = $mysqli->prepare("UPDATE reservations SET status = 'active' WHERE id = ?");
        $activateStmt->bind_param('i', $reservationId);
        $activateStmt->execute();
        set_property_status($mysqli, $propertyId, 'reserved');

        create_notification(
            $mysqli,
            (int) $reservation['user_id'],
            'reservation',
            'Reservation Activated',
            'Your reservation is now active because the required payment has been confirmed.',
            'reservation',
            $reservationId
        );
    }

    if ($paymentType === 'full_payment') {
        $completeStmt = $mysqli->prepare("UPDATE reservations SET status = 'completed' WHERE id = ? AND status <> 'completed'");
        $completeStmt->bind_param('i', $reservationId);
        $completeStmt->execute();
        set_property_status($mysqli, $propertyId, 'sold');

        create_notification(
            $mysqli,
            (int) $reservation['user_id'],
            'payment',
            'Property Marked Sold',
            'Full payment has been confirmed and the property is now marked as sold.',
            'reservation',
            $reservationId
        );
    }
}

$paymentSelectSql = 'SELECT pay.*,
                   COALESCE(p.title, "[Deleted Property]") AS property_title,
                   COALESCE(p.image, "") AS property_image,
                   CONCAT(b.first_name, " ", b.last_name) AS buyer_name,
                   CONCAT(s.first_name, " ", s.last_name) AS seller_name
            FROM payments pay
            LEFT JOIN properties p ON p.id = pay.property_id
            JOIN users b ON b.id = pay.buyer_id
            JOIN users s ON s.id = pay.seller_id';

if ($method === 'GET') {
    expire_stale_reservations_and_release_properties($mysqli);

    $uid = (int) $user['id'];
    $role = (string) $user['user_type'];
    $pagination = get_pagination_params(20, 100);

    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id > 0) {
        $stmt = $mysqli->prepare($paymentSelectSql . ' WHERE pay.id = ? LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) {
            send_json(404, ['ok' => false, 'error' => 'Payment not found']);
        }
        if ($role !== 'administrator' && $role !== 'clerk' && (int) $row['buyer_id'] !== $uid && (int) $row['seller_id'] !== $uid) {
            send_json(403, ['ok' => false, 'error' => 'Access denied']);
        }
        send_json(200, ['ok' => true, 'data' => build_payment_row($row)]);
    }

    $where = [];
    $params = [];
    $types = '';

    if ($role !== 'administrator' && $role !== 'clerk') {
        $where[] = '(pay.buyer_id = ? OR pay.seller_id = ?)';
        $params[] = $uid;
        $params[] = $uid;
        $types .= 'ii';
    }

    if (!empty($_GET['status'])) {
        $where[] = 'pay.status = ?';
        $params[] = trim((string) $_GET['status']);
        $types .= 's';
    }

    if (!empty($_GET['propertyId'])) {
        $where[] = 'pay.property_id = ?';
        $params[] = (int) $_GET['propertyId'];
        $types .= 'i';
    }

    if (!empty($_GET['reservationId'])) {
        $where[] = 'pay.reservation_id = ?';
        $params[] = (int) $_GET['reservationId'];
        $types .= 'i';
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $countSql = "SELECT COUNT(*) AS total FROM payments pay{$whereSql}";
    if ($params) {
        $countStmt = $mysqli->prepare($countSql);
        $countStmt->bind_param($types, ...$params);
        $countStmt->execute();
        $total = (int) $countStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = $paymentSelectSql . "{$whereSql} ORDER BY pay.created_at DESC LIMIT {$pagination['limit']} OFFSET {$pagination['offset']}";
    if ($params) {
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $mysqli->query($sql);
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = build_payment_row($row);
    }

    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

if ($method === 'POST') {
    expire_stale_reservations_and_release_properties($mysqli);
    $body = get_json_body();

    if (($user['user_type'] ?? '') !== 'buyer') {
        send_json(403, ['ok' => false, 'error' => 'Only buyers can submit payments']);
    }

    check_rate_limit($mysqli, 'create_payment', 'user:' . $user['id'], 5, 3600);

    $propertyId = (int) ($body['propertyId'] ?? 0);
    $reservationId = (int) ($body['reservationId'] ?? 0);
    $amount = (int) ($body['amount'] ?? 0);
    $paymentChannel = trim((string) ($body['paymentChannel'] ?? 'online'));
    $paymentMethod = trim((string) ($body['paymentMethod'] ?? ''));
    $paymentType = trim((string) ($body['paymentType'] ?? 'reservation'));
    $referenceNo = sanitize_string((string) ($body['referenceNo'] ?? ''), 100);
    $notes = sanitize_string((string) ($body['notes'] ?? ''), 500);
    $proofUrl = sanitize_string((string) ($body['proofUrl'] ?? ''));

    if ($propertyId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }
    if ($amount <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Amount must be greater than zero']);
    }
    if (!in_array($paymentChannel, ['walk_in', 'online'], true)) {
        send_json(422, ['ok' => false, 'error' => 'Payment channel must be walk_in or online']);
    }

    $validMethods = ['bank_transfer', 'gcash', 'pagibig', 'cash', 'credit_card'];
    if (!in_array($paymentMethod, $validMethods, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid payment method']);
    }

    $validTypes = ['reservation', 'down_payment', 'full_payment', 'monthly'];
    if (!in_array($paymentType, $validTypes, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid payment type']);
    }

    if ($paymentChannel === 'walk_in' && $paymentMethod !== 'cash') {
        send_json(422, ['ok' => false, 'error' => 'Walk-in payments must use the cash payment method']);
    }
    if ($paymentChannel === 'online' && $paymentMethod === 'cash') {
        send_json(422, ['ok' => false, 'error' => 'Cash payments must be processed as walk-in payments']);
    }

    $propertyStmt = $mysqli->prepare('SELECT id, owner_id, status, title FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $propertyStmt->bind_param('i', $propertyId);
    $propertyStmt->execute();
    $property = $propertyStmt->get_result()->fetch_assoc();
    if (!$property) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }

    $buyerId = (int) $user['id'];
    $sellerId = (int) $property['owner_id'];
    if ($buyerId === $sellerId) {
        send_json(422, ['ok' => false, 'error' => 'Cannot pay for your own property']);
    }

    check_reservation_lock($mysqli, $propertyId, $buyerId);

    if ($reservationId > 0) {
        $reservationStmt = $mysqli->prepare(
            'SELECT * FROM reservations WHERE id = ? AND property_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1'
        );
        $reservationStmt->bind_param('iii', $reservationId, $propertyId, $buyerId);
        $reservationStmt->execute();
        $reservation = $reservationStmt->get_result()->fetch_assoc() ?: null;
    } else {
        $reservation = get_buyer_reservation($mysqli, $propertyId, $buyerId, ['pending', 'active', 'completed']);
    }
    if (!$reservation) {
        send_json(422, ['ok' => false, 'error' => 'A valid reservation is required before payment']);
    }
    if (empty($reservation['calculator_snapshot'])) {
        send_json(422, ['ok' => false, 'error' => 'Down payment calculation must be completed before payment']);
    }
    if (($reservation['payment_intent'] ?? '') !== $paymentChannel) {
        send_json(422, ['ok' => false, 'error' => 'Payment channel must match the reservation payment intent']);
    }
    if (in_array($paymentType, ['reservation', 'down_payment'], true) && !in_array((string) $reservation['status'], ['pending', 'active'], true)) {
        send_json(422, ['ok' => false, 'error' => 'This reservation is no longer eligible for reservation payment processing']);
    }
    if (in_array($paymentType, ['full_payment', 'monthly'], true) && (string) $reservation['status'] !== 'active') {
        send_json(422, ['ok' => false, 'error' => 'Only active reservations can proceed to offer-stage payments']);
    }

    if (in_array($paymentType, ['reservation', 'down_payment'], true) && (string) $property['status'] !== 'reserved') {
        send_json(422, ['ok' => false, 'error' => 'Reservation and down payment transactions are only allowed while the property is reserved']);
    }
    if ($paymentType === 'full_payment' && (string) $property['status'] !== 'under_offer') {
        send_json(422, ['ok' => false, 'error' => 'Full payment is only allowed after an offer has been accepted']);
    }

    $duplicateStmt = $mysqli->prepare(
        "SELECT id
         FROM payments
         WHERE buyer_id = ?
           AND property_id = ?
           AND reservation_id = ?
           AND payment_type = ?
           AND status = 'pending'
         LIMIT 1"
    );
    $duplicateStmt->bind_param('iiis', $buyerId, $propertyId, $reservation['id'], $paymentType);
    $duplicateStmt->execute();
    if ($duplicateStmt->get_result()->fetch_assoc()) {
        send_json(409, ['ok' => false, 'error' => 'You already have a pending payment of this type for this reservation']);
    }

    $status = $paymentChannel === 'online' ? 'paid' : 'pending';
    if ($referenceNo === '') {
        $referenceNo = generate_payment_reference($paymentChannel === 'walk_in' ? 'WALK' : 'PAY');
    }

    $insertStmt = $mysqli->prepare(
        'INSERT INTO payments (property_id, reservation_id, buyer_id, seller_id, amount, payment_channel, payment_method, payment_type, reference_no, status, notes, proof_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $notesOrNull = $notes !== '' ? $notes : null;
    $proofOrNull = $proofUrl !== '' ? $proofUrl : null;
    $insertStmt->bind_param(
        'iiiiisssssss',
        $propertyId,
        $reservation['id'],
        $buyerId,
        $sellerId,
        $amount,
        $paymentChannel,
        $paymentMethod,
        $paymentType,
        $referenceNo,
        $status,
        $notesOrNull,
        $proofOrNull
    );
    $insertStmt->execute();
    $newId = (int) $mysqli->insert_id;

    audit_log($mysqli, $buyerId, 'CREATE', 'payment', $newId, "Payment of {$amount} for property #{$propertyId}");

    if ($paymentChannel === 'walk_in') {
        $clerks = $mysqli->query("SELECT id FROM users WHERE user_type = 'clerk' AND deleted_at IS NULL");
        while ($clerk = $clerks->fetch_assoc()) {
            create_notification($mysqli, (int) $clerk['id'], 'payment', 'Walk-in Payment Pending', 'A walk-in payment is awaiting clerk validation.', 'payment', $newId);
        }
    }

    create_notification($mysqli, $sellerId, 'payment', 'New Payment Submitted', 'A buyer has submitted a payment linked to a reservation.', 'payment', $newId);

    $fetchStmt = $mysqli->prepare($paymentSelectSql . ' WHERE pay.id = ? LIMIT 1');
    $fetchStmt->bind_param('i', $newId);
    $fetchStmt->execute();
    $newRow = $fetchStmt->get_result()->fetch_assoc();

    if ($status === 'paid' && $newRow) {
        activate_reservation_from_paid_payment($mysqli, $newRow);
    }

    if (!$newRow) {
        send_json(500, ['ok' => false, 'error' => 'Failed to load the new payment record']);
    }

    send_json(201, ['ok' => true, 'data' => build_payment_row($newRow)]);
}

if ($method === 'PATCH') {
    expire_stale_reservations_and_release_properties($mysqli);
    $id = get_request_id();
    $body = get_json_body();
    $uid = (int) $user['id'];
    $role = (string) $user['user_type'];

    $stmt = $mysqli->prepare('SELECT * FROM payments WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $payment = $stmt->get_result()->fetch_assoc();
    if (!$payment) {
        send_json(404, ['ok' => false, 'error' => 'Payment not found']);
    }

    if (!in_array($role, ['administrator', 'clerk'], true)) {
        send_json(403, ['ok' => false, 'error' => 'Only clerks or administrators can update payment status']);
    }

    $action = trim((string) ($body['action'] ?? ''));
    if ($action === 'refund') {
        if ($role !== 'administrator') {
            send_json(403, ['ok' => false, 'error' => 'Only administrators can process refunds']);
        }
        if ((string) $payment['status'] !== 'paid') {
            send_json(422, ['ok' => false, 'error' => 'Only paid payments can be refunded']);
        }

        $refundAmount = (int) ($body['refundAmount'] ?? $payment['amount']);
        $refundReason = sanitize_string((string) ($body['refundReason'] ?? ''), 500);
        if ($refundAmount <= 0 || $refundAmount > (int) $payment['amount']) {
            send_json(422, ['ok' => false, 'error' => 'Invalid refund amount']);
        }

        $now = date('Y-m-d H:i:s');
        $updateStmt = $mysqli->prepare(
            'UPDATE payments SET status = "refunded", refund_amount = ?, refund_reason = ?, refund_approved_by = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
        );
        $updateStmt->bind_param('isiiis', $refundAmount, $refundReason, $uid, $uid, $now, $id);
        $updateStmt->execute();

        audit_log($mysqli, $uid, 'REFUND', 'payment', $id, "Refunded payment #{$id}");
        create_notification($mysqli, (int) $payment['buyer_id'], 'payment', 'Payment Refunded', 'Your payment has been refunded.', 'payment', $id);
    } else {
        $newStatus = trim((string) ($body['status'] ?? ''));
        if (!in_array($newStatus, ['pending', 'paid', 'failed', 'refunded'], true)) {
            send_json(422, ['ok' => false, 'error' => 'Invalid status']);
        }

        $now = date('Y-m-d H:i:s');
        $updateStmt = $mysqli->prepare('UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?');
        $updateStmt->bind_param('siis', $newStatus, $uid, $now, $id);
        $updateStmt->execute();

        audit_log($mysqli, $uid, 'UPDATE', 'payment', $id, "Payment status -> {$newStatus}");

        if ($newStatus === 'paid') {
            $payment['status'] = 'paid';
            activate_reservation_from_paid_payment($mysqli, $payment);
        }

        create_notification($mysqli, (int) $payment['buyer_id'], 'payment', 'Payment Status Updated', "Your payment status is now {$newStatus}.", 'payment', $id);
    }

    $fetchStmt = $mysqli->prepare($paymentSelectSql . ' WHERE pay.id = ? LIMIT 1');
    $fetchStmt->bind_param('i', $id);
    $fetchStmt->execute();
    $updated = $fetchStmt->get_result()->fetch_assoc();

    if (!$updated) {
        send_json(500, ['ok' => false, 'error' => 'Failed to load the updated payment record']);
    }

    send_json(200, ['ok' => true, 'data' => build_payment_row($updated)]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
