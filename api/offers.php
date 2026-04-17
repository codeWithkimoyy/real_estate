<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user = require_auth($mysqli);

function build_offer_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'propertyId' => (int) $row['property_id'],
        'propertyTitle' => (string) ($row['property_title'] ?? ''),
        'reservationId' => (int) $row['reservation_id'],
        'buyerId' => (int) $row['buyer_id'],
        'buyerName' => (string) ($row['buyer_name'] ?? ''),
        'sellerId' => (int) $row['seller_id'],
        'sellerName' => (string) ($row['seller_name'] ?? ''),
        'amount' => (int) $row['amount'],
        'message' => $row['message'] ?? null,
        'status' => (string) $row['status'],
        'counterAmount' => isset($row['counter_amount']) && $row['counter_amount'] !== null ? (int) $row['counter_amount'] : null,
        'counterMessage' => $row['counter_message'] ?? null,
        'respondedBy' => isset($row['responded_by']) && $row['responded_by'] !== null ? (int) $row['responded_by'] : null,
        'respondedAt' => $row['responded_at'] ?? null,
        'createdAt' => (string) $row['created_at'],
        'updatedAt' => (string) $row['updated_at'],
    ];
}

$offerSelectSql = 'SELECT o.*, p.title AS property_title,
                   CONCAT(b.first_name, " ", b.last_name) AS buyer_name,
                   CONCAT(s.first_name, " ", s.last_name) AS seller_name
            FROM offers o
            JOIN properties p ON p.id = o.property_id
            JOIN users b ON b.id = o.buyer_id
            JOIN users s ON s.id = o.seller_id';

if ($method === 'GET') {
    expire_stale_reservations_and_release_properties($mysqli);

    $uid = (int) $user['id'];
    $role = (string) $user['user_type'];
    $pagination = get_pagination_params(20, 100);

    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id > 0) {
        $stmt = $mysqli->prepare($offerSelectSql . ' WHERE o.id = ? AND o.deleted_at IS NULL LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) {
            send_json(404, ['ok' => false, 'error' => 'Offer not found']);
        }
        if ($role !== 'administrator' && $role !== 'clerk' && (int) $row['buyer_id'] !== $uid && (int) $row['seller_id'] !== $uid) {
            send_json(403, ['ok' => false, 'error' => 'Access denied']);
        }
        send_json(200, ['ok' => true, 'data' => build_offer_row($row)]);
    }

    $where = ['o.deleted_at IS NULL'];
    $params = [];
    $types = '';

    if ($role !== 'administrator' && $role !== 'clerk') {
        $where[] = '(o.buyer_id = ? OR o.seller_id = ?)';
        $params[] = $uid;
        $params[] = $uid;
        $types .= 'ii';
    }

    if (!empty($_GET['propertyId'])) {
        $where[] = 'o.property_id = ?';
        $params[] = (int) $_GET['propertyId'];
        $types .= 'i';
    }
    if (!empty($_GET['reservationId'])) {
        $where[] = 'o.reservation_id = ?';
        $params[] = (int) $_GET['reservationId'];
        $types .= 'i';
    }
    if (!empty($_GET['status'])) {
        $where[] = 'o.status = ?';
        $params[] = trim((string) $_GET['status']);
        $types .= 's';
    }

    $whereSql = implode(' AND ', $where);

    $countSql = "SELECT COUNT(*) AS total FROM offers o WHERE {$whereSql}";
    if ($params) {
        $countStmt = $mysqli->prepare($countSql);
        $countStmt->bind_param($types, ...$params);
        $countStmt->execute();
        $total = (int) $countStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = $offerSelectSql . " WHERE {$whereSql} ORDER BY o.created_at DESC LIMIT {$pagination['limit']} OFFSET {$pagination['offset']}";
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
        $rows[] = build_offer_row($row);
    }

    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

if ($method === 'POST') {
    expire_stale_reservations_and_release_properties($mysqli);
    $body = get_json_body();

    if (($user['user_type'] ?? '') !== 'buyer') {
        send_json(403, ['ok' => false, 'error' => 'Only buyers can submit offers']);
    }

    $propertyId = (int) ($body['propertyId'] ?? 0);
    $reservationId = (int) ($body['reservationId'] ?? 0);
    $amount = (int) ($body['amount'] ?? 0);
    $message = sanitize_string((string) ($body['message'] ?? ''), 1000);

    if ($propertyId <= 0 || $reservationId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID and reservation ID are required']);
    }
    if ($amount <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Offer amount must be greater than zero']);
    }

    $propertyStmt = $mysqli->prepare('SELECT id, owner_id, status, title FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $propertyStmt->bind_param('i', $propertyId);
    $propertyStmt->execute();
    $property = $propertyStmt->get_result()->fetch_assoc();
    if (!$property) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }
    if ((string) $property['status'] !== 'reserved') {
        send_json(422, ['ok' => false, 'error' => 'Offers can only be submitted after a valid reservation is active']);
    }

    $buyerId = (int) $user['id'];
    $sellerId = (int) $property['owner_id'];
    if ($buyerId === $sellerId) {
        send_json(422, ['ok' => false, 'error' => 'You cannot make an offer on your own property']);
    }

    $reservationStmt = $mysqli->prepare(
        'SELECT * FROM reservations WHERE id = ? AND property_id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1'
    );
    $reservationStmt->bind_param('iii', $reservationId, $propertyId, $buyerId);
    $reservationStmt->execute();
    $reservation = $reservationStmt->get_result()->fetch_assoc();
    if (!$reservation) {
        send_json(422, ['ok' => false, 'error' => 'A valid reservation is required before you can submit an offer']);
    }
    if ((string) $reservation['status'] !== 'active') {
        send_json(422, ['ok' => false, 'error' => 'Offers are only allowed after the reservation becomes active']);
    }

    $openOfferStmt = $mysqli->prepare(
        "SELECT id
         FROM offers
         WHERE reservation_id = ?
           AND status IN ('pending', 'countered')
           AND deleted_at IS NULL
         LIMIT 1"
    );
    $openOfferStmt->bind_param('i', $reservationId);
    $openOfferStmt->execute();
    if ($openOfferStmt->get_result()->fetch_assoc()) {
        send_json(409, ['ok' => false, 'error' => 'There is already an open offer for this reservation']);
    }

    $insertStmt = $mysqli->prepare(
        'INSERT INTO offers (property_id, reservation_id, buyer_id, seller_id, amount, message, status)
         VALUES (?, ?, ?, ?, ?, ?, \'pending\')'
    );
    $messageOrNull = $message !== '' ? $message : null;
    $insertStmt->bind_param('iiiiss', $propertyId, $reservationId, $buyerId, $sellerId, $amount, $messageOrNull);
    $insertStmt->execute();
    $newId = (int) $mysqli->insert_id;

    audit_log($mysqli, $buyerId, 'CREATE', 'offer', $newId, "Submitted offer of {$amount} on property #{$propertyId}");
    create_notification($mysqli, $sellerId, 'offer', 'New Offer Submitted', "A buyer submitted an offer for \"{$property['title']}\".", 'offer', $newId);

    $fetchStmt = $mysqli->prepare($offerSelectSql . ' WHERE o.id = ? LIMIT 1');
    $fetchStmt->bind_param('i', $newId);
    $fetchStmt->execute();
    $newRow = $fetchStmt->get_result()->fetch_assoc();
    send_json(201, ['ok' => true, 'data' => build_offer_row($newRow)]);
}

if ($method === 'PATCH') {
    $body = get_json_body();
    $offerId = isset($_GET['id']) ? (int) $_GET['id'] : (int) ($body['id'] ?? 0);
    if ($offerId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Offer ID is required']);
    }

    $stmt = $mysqli->prepare('SELECT * FROM offers WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $offerId);
    $stmt->execute();
    $offer = $stmt->get_result()->fetch_assoc();
    if (!$offer) {
        send_json(404, ['ok' => false, 'error' => 'Offer not found']);
    }

    $propertyStmt = $mysqli->prepare('SELECT owner_id, title FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $propertyStmt->bind_param('i', $offer['property_id']);
    $propertyStmt->execute();
    $property = $propertyStmt->get_result()->fetch_assoc();
    if (!$property) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }

    $uid = (int) $user['id'];
    $role = (string) ($user['user_type'] ?? '');
    $isPrivileged = in_array($role, ['administrator', 'clerk'], true);
    $isSeller = (int) $property['owner_id'] === $uid;
    $isBuyer = (int) $offer['buyer_id'] === $uid;

    $action = trim((string) ($body['action'] ?? ''));
    if (!in_array($action, ['accept', 'reject', 'counter', 'cancel'], true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid offer action']);
    }

    if (in_array($action, ['accept', 'reject', 'counter'], true) && !$isPrivileged && !$isSeller) {
        send_json(403, ['ok' => false, 'error' => 'Only the seller or an administrator can respond to this offer']);
    }
    if ($action === 'cancel' && !$isBuyer && !$isPrivileged) {
        send_json(403, ['ok' => false, 'error' => 'Only the buyer or an administrator can cancel this offer']);
    }
    if (!in_array((string) $offer['status'], ['pending', 'countered'], true)) {
        send_json(422, ['ok' => false, 'error' => 'Only open offers can be updated']);
    }

    $newStatus = (string) $offer['status'];
    $counterAmount = $offer['counter_amount'];
    $counterMessage = $offer['counter_message'];
    $now = date('Y-m-d H:i:s');
    if ($action === 'accept') {
        $reservationStmt = $mysqli->prepare('SELECT status FROM reservations WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $reservationStmt->bind_param('i', $offer['reservation_id']);
        $reservationStmt->execute();
        $reservation = $reservationStmt->get_result()->fetch_assoc();
        if (!$reservation || (string) $reservation['status'] !== 'active') {
            send_json(422, ['ok' => false, 'error' => 'Only offers tied to an active reservation can be accepted']);
        }
        $newStatus = 'accepted';
        set_property_status($mysqli, (int) $offer['property_id'], 'under_offer');
        $rejectOthersStmt = $mysqli->prepare(
            "UPDATE offers
             SET status = 'rejected', responded_by = ?, responded_at = ?
             WHERE property_id = ?
               AND id <> ?
               AND status IN ('pending', 'countered')
               AND deleted_at IS NULL"
        );
        $rejectOthersStmt->bind_param('isii', $uid, $now, $offer['property_id'], $offerId);
        $rejectOthersStmt->execute();
    } elseif ($action === 'reject') {
        $newStatus = 'rejected';
    } elseif ($action === 'counter') {
        $counterAmountValue = (int) ($body['counterAmount'] ?? 0);
        if ($counterAmountValue <= 0) {
            send_json(422, ['ok' => false, 'error' => 'Counter amount must be greater than zero']);
        }
        $newStatus = 'countered';
        $counterAmount = $counterAmountValue;
        $counterMessage = sanitize_string((string) ($body['counterMessage'] ?? ''), 1000);
    } elseif ($action === 'cancel') {
        $newStatus = 'cancelled';
    }

    $updateStmt = $mysqli->prepare(
        'UPDATE offers SET status = ?, counter_amount = ?, counter_message = ?, responded_by = ?, responded_at = ? WHERE id = ?'
    );
    $updateStmt->bind_param('sisisi', $newStatus, $counterAmount, $counterMessage, $uid, $now, $offerId);
    $updateStmt->execute();

    if ($newStatus !== 'accepted') {
        sync_property_status($mysqli, (int) $offer['property_id']);
    }

    audit_log($mysqli, $uid, 'UPDATE', 'offer', $offerId, "Offer action: {$action}");

    $notifyUserId = $action === 'cancel' ? (int) $offer['seller_id'] : (int) $offer['buyer_id'];
    create_notification($mysqli, $notifyUserId, 'offer', 'Offer Updated', "Offer status is now {$newStatus}.", 'offer', $offerId);

    $fetchStmt = $mysqli->prepare($offerSelectSql . ' WHERE o.id = ? LIMIT 1');
    $fetchStmt->bind_param('i', $offerId);
    $fetchStmt->execute();
    $updated = $fetchStmt->get_result()->fetch_assoc();
    send_json(200, ['ok' => true, 'data' => build_offer_row($updated)]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
