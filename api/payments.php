<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = require_auth($mysqli);

// ── Helper: build payment row ────────────────────────────

function build_payment_row(array $row): array
{
    return [
        'id'              => (int) $row['id'],
        'propertyId'      => (int) $row['property_id'],
        'propertyTitle'   => (string) ($row['property_title'] ?? ''),
        'propertyImage'   => (string) ($row['property_image'] ?? ''),
        'buyerId'         => (int) $row['buyer_id'],
        'buyerName'       => (string) ($row['buyer_name'] ?? ''),
        'sellerId'        => (int) $row['seller_id'],
        'sellerName'      => (string) ($row['seller_name'] ?? ''),
        'amount'          => (int) $row['amount'],
        'paymentMethod'   => (string) $row['payment_method'],
        'paymentType'     => (string) $row['payment_type'],
        'referenceNo'     => $row['reference_no'] ? (string) $row['reference_no'] : null,
        'status'          => (string) $row['status'],
        'notes'           => $row['notes'] ? (string) $row['notes'] : null,
        'proofUrl'        => $row['proof_url'] ? (string) $row['proof_url'] : null,
        'reviewedBy'      => isset($row['reviewed_by']) && $row['reviewed_by'] ? (int) $row['reviewed_by'] : null,
        'reviewedAt'      => $row['reviewed_at'] ?? null,
        'refundAmount'    => isset($row['refund_amount']) ? (int) $row['refund_amount'] : null,
        'refundReason'    => $row['refund_reason'] ?? null,
        'createdAt'       => (string) $row['created_at'],
        'updatedAt'       => (string) $row['updated_at'],
    ];
}

$paymentSelectSql = 'SELECT pay.*,
                   p.title AS property_title, p.image AS property_image,
                   CONCAT(b.first_name, " ", b.last_name) AS buyer_name,
                   CONCAT(s.first_name, " ", s.last_name) AS seller_name
            FROM payments pay
            JOIN properties p ON p.id = pay.property_id
            JOIN users b ON b.id = pay.buyer_id
            JOIN users s ON s.id = pay.seller_id';

// ── GET (list payments) ──────────────────────────────────

if ($method === 'GET') {
    $uid  = (int) $user['id'];
    $role = $user['user_type'];
    $pagination = get_pagination_params(20, 100);

    // Single payment by id
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

    // List with filters and pagination
    $where  = [];
    $params = [];
    $types  = '';

    if ($role === 'administrator' || $role === 'clerk') {
        if (!empty($_GET['status'])) {
            $where[]  = 'pay.status = ?';
            $params[] = $_GET['status'];
            $types   .= 's';
        }
    } else {
        $where[]  = '(pay.buyer_id = ? OR pay.seller_id = ?)';
        $params[] = $uid;
        $params[] = $uid;
        $types   .= 'ii';
    }

    if (!empty($_GET['propertyId'])) {
        $where[]  = 'pay.property_id = ?';
        $params[] = (int) $_GET['propertyId'];
        $types   .= 'i';
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    // Count
    $countSql = "SELECT COUNT(*) AS total FROM payments pay{$whereSql}";
    if ($params) {
        $cStmt = $mysqli->prepare($countSql);
        $cStmt->bind_param($types, ...$params);
        $cStmt->execute();
        $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
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

// ── POST (create payment) ────────────────────────────────

if ($method === 'POST') {
    $body = get_json_body();

    check_rate_limit($mysqli, 'create_payment', 'user:' . $user['id'], 5, 3600);

    $propertyId    = (int) ($body['propertyId'] ?? 0);
    $amount        = (int) ($body['amount'] ?? 0);
    $paymentMethod = trim((string) ($body['paymentMethod'] ?? ''));
    $paymentType   = trim((string) ($body['paymentType'] ?? 'reservation'));
    $referenceNo   = sanitize_string((string) ($body['referenceNo'] ?? ''), 100);
    $notes         = sanitize_string((string) ($body['notes'] ?? ''), 500);
    $proofUrl      = sanitize_string((string) ($body['proofUrl'] ?? ''));

    if ($propertyId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }
    if ($amount <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Amount must be greater than zero']);
    }

    $validMethods = ['bank_transfer', 'gcash', 'pagibig', 'cash', 'credit_card'];
    if (!in_array($paymentMethod, $validMethods, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid payment method']);
    }

    $validTypes = ['reservation', 'down_payment', 'full_payment', 'monthly'];
    if (!in_array($paymentType, $validTypes, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid payment type']);
    }

    // Get property and verify it exists + is approved
    $chk = $mysqli->prepare('SELECT id, owner_id, status FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $chk->bind_param('i', $propertyId);
    $chk->execute();
    $prop = $chk->get_result()->fetch_assoc();

    if (!$prop) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }
    if ($prop['status'] !== 'approved') {
        send_json(422, ['ok' => false, 'error' => 'Property is not available for payment']);
    }

    $buyerId  = (int) $user['id'];
    $sellerId = (int) $prop['owner_id'];

    if ($buyerId === $sellerId) {
        send_json(422, ['ok' => false, 'error' => 'Cannot pay for your own property']);
    }

    // Block if reserved by someone else
    check_reservation_lock($mysqli, $propertyId, $buyerId);

    $stmt = $mysqli->prepare(
        'INSERT INTO payments (property_id, buyer_id, seller_id, amount, payment_method, payment_type, reference_no, notes, proof_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $refNoOrNull   = $referenceNo ?: null;
    $notesOrNull   = $notes ?: null;
    $proofOrNull   = $proofUrl ?: null;
    $stmt->bind_param(
        'iiiisssss',
        $propertyId, $buyerId, $sellerId, $amount,
        $paymentMethod, $paymentType, $refNoOrNull, $notesOrNull, $proofOrNull
    );
    $stmt->execute();
    $newId = (int) $mysqli->insert_id;

    audit_log($mysqli, $buyerId, 'CREATE', 'payment', $newId, "Payment of {$amount} for property #{$propertyId}");

    // Notify seller
    $buyerName = $user['first_name'] . ' ' . $user['last_name'];
    create_notification($mysqli, $sellerId, 'payment', 'New Payment', "{$buyerName} submitted a {$paymentType} payment of ₱" . number_format($amount), 'payment', $newId);

    $fetch = $mysqli->prepare($paymentSelectSql . ' WHERE pay.id = ? LIMIT 1');
    $fetch->bind_param('i', $newId);
    $fetch->execute();
    $newRow = $fetch->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_payment_row($newRow)]);
}

// ── PATCH (update status / refund) ───────────────────────

if ($method === 'PATCH') {
    $id   = get_request_id();
    $body = get_json_body();
    $uid  = (int) $user['id'];
    $role = $user['user_type'];

    $stmt = $mysqli->prepare('SELECT * FROM payments WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $payment = $stmt->get_result()->fetch_assoc();

    if (!$payment) {
        send_json(404, ['ok' => false, 'error' => 'Payment not found']);
    }

    // Only admin, clerk, or seller can update payment status
    if ($role !== 'administrator' && $role !== 'clerk' && (int) $payment['seller_id'] !== $uid) {
        send_json(403, ['ok' => false, 'error' => 'Only admins or the seller can update payment status']);
    }

    $action = trim((string) ($body['action'] ?? ''));

    // Refund action
    if ($action === 'refund') {
        if ($role !== 'administrator') {
            send_json(403, ['ok' => false, 'error' => 'Only administrators can process refunds']);
        }
        if ($payment['status'] !== 'completed') {
            send_json(422, ['ok' => false, 'error' => 'Only completed payments can be refunded']);
        }

        $refundAmount = (int) ($body['refundAmount'] ?? $payment['amount']);
        $refundReason = sanitize_string((string) ($body['refundReason'] ?? ''), 500);

        if ($refundAmount <= 0 || $refundAmount > (int) $payment['amount']) {
            send_json(422, ['ok' => false, 'error' => 'Invalid refund amount']);
        }

        $now = date('Y-m-d H:i:s');
        $upd = $mysqli->prepare(
            'UPDATE payments SET status = "refunded", refund_amount = ?, refund_reason = ?,
             refund_approved_by = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?'
        );
        $upd->bind_param('isiiis', $refundAmount, $refundReason, $uid, $uid, $now, $id);
        $upd->execute();

        audit_log($mysqli, $uid, 'REFUND', 'payment', $id, "Refunded ₱" . number_format($refundAmount));

        // Notify buyer
        create_notification($mysqli, (int) $payment['buyer_id'], 'payment', 'Payment Refunded', "Your payment of ₱" . number_format((int) $payment['amount']) . " has been refunded (₱" . number_format($refundAmount) . ").", 'payment', $id);
    } else {
        // Standard status update
        $newStatus = trim((string) ($body['status'] ?? ''));
        $validStatuses = ['pending', 'processing', 'completed', 'failed', 'refunded'];
        if (!in_array($newStatus, $validStatuses, true)) {
            send_json(422, ['ok' => false, 'error' => 'Invalid status']);
        }

        $now = date('Y-m-d H:i:s');
        $upd = $mysqli->prepare('UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?');
        $upd->bind_param('siis', $newStatus, $uid, $now, $id);
        $upd->execute();

        audit_log($mysqli, $uid, 'UPDATE', 'payment', $id, "Payment status → {$newStatus}");

        // Notify buyer of status change
        $statusLabel = ucfirst($newStatus);
        create_notification($mysqli, (int) $payment['buyer_id'], 'payment', "Payment {$statusLabel}", "Your payment status has been updated to {$newStatus}.", 'payment', $id);
    }

    $fetch = $mysqli->prepare($paymentSelectSql . ' WHERE pay.id = ? LIMIT 1');
    $fetch->bind_param('i', $id);
    $fetch->execute();
    $updated = $fetch->get_result()->fetch_assoc();

    send_json(200, ['ok' => true, 'data' => build_payment_row($updated)]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
