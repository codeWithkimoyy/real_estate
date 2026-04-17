<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

function build_reservation_row(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'propertyId' => (int) $row['property_id'],
        'propertyTitle' => (string) ($row['property_title'] ?? ''),
        'propertyImage' => (string) ($row['property_image'] ?? ''),
        'propertyAddress' => (string) ($row['property_address'] ?? ''),
        'propertyCity' => (string) ($row['property_city'] ?? ''),
        'propertyProvince' => (string) ($row['property_province'] ?? ''),
        'userId' => (int) $row['user_id'],
        'userName' => (string) ($row['user_name'] ?? ''),
        'ownerName' => (string) ($row['owner_name'] ?? ''),
        'ownerId' => (int) ($row['property_owner_id'] ?? 0),
        'status' => (string) $row['status'],
        'expiresAt' => (string) $row['expires_at'],
        'notes' => $row['notes'] ?? null,
        'paymentIntent' => $row['payment_intent'] ?? null,
        'calculatorSnapshot' => decode_json_field($row['calculator_snapshot'] ?? null),
        'createdAt' => (string) $row['created_at'],
        'updatedAt' => (string) $row['updated_at'],
    ];
}

$selectSql = 'SELECT r.*, p.title AS property_title, p.image AS property_image,
              p.address AS property_address, p.city AS property_city, p.province AS property_province,
              p.owner_id AS property_owner_id,
              CONCAT(u.first_name, " ", u.last_name) AS user_name,
              CONCAT(o.first_name, " ", o.last_name) AS owner_name
              FROM reservations r
              JOIN properties p ON p.id = r.property_id
              JOIN users u ON u.id = r.user_id
              JOIN users o ON o.id = p.owner_id';

if ($method === 'GET') {
    $user = require_auth($mysqli);
    expire_stale_reservations_and_release_properties($mysqli);

    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $propertyId = isset($_GET['property_id']) ? (int) $_GET['property_id'] : 0;

    if ($id > 0) {
        $stmt = $mysqli->prepare($selectSql . ' WHERE r.id = ? AND r.deleted_at IS NULL LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) {
            send_json(404, ['ok' => false, 'error' => 'Reservation not found']);
        }

        $isPrivileged = in_array($user['user_type'], ['administrator', 'clerk'], true);
        $isReservationOwner = (int) $row['user_id'] === (int) $user['id'];
        $isPropertyOwner = (int) ($row['property_owner_id'] ?? 0) === (int) $user['id'];
        if (!$isPrivileged && !$isReservationOwner && !$isPropertyOwner) {
            send_json(403, ['ok' => false, 'error' => 'You do not have permission to view this reservation']);
        }

        send_json(200, ['ok' => true, 'data' => build_reservation_row($row)]);
    }

    if ($propertyId > 0) {
        $isPrivileged = in_array($user['user_type'], ['administrator', 'clerk'], true);
        if (!$isPrivileged) {
            $propOwnerStmt = $mysqli->prepare('SELECT owner_id FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
            $propOwnerStmt->bind_param('i', $propertyId);
            $propOwnerStmt->execute();
            $propOwner = $propOwnerStmt->get_result()->fetch_assoc();
            $isPropertyOwner = $propOwner && (int) $propOwner['owner_id'] === (int) $user['id'];

            if (!$isPropertyOwner) {
                $stmt = $mysqli->prepare($selectSql . " WHERE r.property_id = ? AND r.user_id = ? AND r.status IN ('pending','active') AND r.deleted_at IS NULL ORDER BY r.created_at DESC");
                $stmt->bind_param('ii', $propertyId, $user['id']);
                $stmt->execute();
                $result = $stmt->get_result();
                $rows = [];
                while ($row = $result->fetch_assoc()) {
                    $rows[] = build_reservation_row($row);
                }
                send_json(200, ['ok' => true, 'data' => $rows]);
            }
        }

        $stmt = $mysqli->prepare($selectSql . " WHERE r.property_id = ? AND r.status IN ('pending','active') AND r.deleted_at IS NULL ORDER BY r.created_at DESC");
        $stmt->bind_param('i', $propertyId);
        $stmt->execute();
        $result = $stmt->get_result();
        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = build_reservation_row($row);
        }
        send_json(200, ['ok' => true, 'data' => $rows]);
    }

    $pagination = get_pagination_params(20, 100);
    $isPrivileged = in_array($user['user_type'], ['administrator', 'clerk'], true);

    $where = ['r.deleted_at IS NULL'];
    $params = [];
    $types = '';

    if (!$isPrivileged) {
        $where[] = '(r.user_id = ? OR r.property_id IN (SELECT id FROM properties WHERE owner_id = ? AND deleted_at IS NULL))';
        $params[] = (int) $user['id'];
        $params[] = (int) $user['id'];
        $types .= 'ii';
    }

    $whereSql = implode(' AND ', $where);

    $countSql = "SELECT COUNT(*) AS total FROM reservations r WHERE {$whereSql}";
    if ($params) {
        $cStmt = $mysqli->prepare($countSql);
        $cStmt->bind_param($types, ...$params);
        $cStmt->execute();
        $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = "{$selectSql} WHERE {$whereSql} ORDER BY r.created_at DESC LIMIT {$pagination['limit']} OFFSET {$pagination['offset']}";
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
        $rows[] = build_reservation_row($row);
    }
    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

if ($method === 'POST') {
    $user = require_auth($mysqli);
    expire_stale_reservations_and_release_properties($mysqli);
    $body = get_json_body();

    if (($user['user_type'] ?? '') !== 'buyer') {
        send_json(403, ['ok' => false, 'error' => 'Only buyers can create reservations']);
    }

    check_rate_limit($mysqli, 'create_reservation', 'user:' . $user['id'], 5, 3600);

    $propertyId = (int) ($body['propertyId'] ?? 0);
    $days = (int) ($body['days'] ?? 7);
    $notes = sanitize_string((string) ($body['notes'] ?? ''), 500);
    $paymentIntent = trim((string) ($body['paymentIntent'] ?? ''));
    $calculatorSnapshot = $body['calculatorSnapshot'] ?? null;

    if ($propertyId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }
    if ($days < 1 || $days > 90) {
        send_json(422, ['ok' => false, 'error' => 'Reservation period must be 1-90 days']);
    }
    if (!in_array($paymentIntent, ['walk_in', 'online'], true)) {
        send_json(422, ['ok' => false, 'error' => 'A payment intent is required before reserving this property']);
    }
    if (!is_array($calculatorSnapshot)) {
        send_json(422, ['ok' => false, 'error' => 'Please complete the down payment calculator before reserving']);
    }

    $pStmt = $mysqli->prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $pStmt->bind_param('i', $propertyId);
    $pStmt->execute();
    $property = $pStmt->get_result()->fetch_assoc();
    if (!$property) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }
    if ((string) $property['status'] !== 'available') {
        send_json(422, ['ok' => false, 'error' => 'Property is not available for reservation']);
    }
    if ((int) $property['owner_id'] === (int) $user['id']) {
        send_json(422, ['ok' => false, 'error' => 'You cannot reserve your own property']);
    }
    if (!has_completed_viewing($mysqli, $propertyId, (int) $user['id'])) {
        send_json(422, ['ok' => false, 'error' => 'A completed viewing is required before reservation']);
    }
    if (get_current_reservation($mysqli, $propertyId)) {
        send_json(409, ['ok' => false, 'error' => 'This property already has a pending or active reservation']);
    }

    $validatedCalculator = validate_calculator_snapshot(
        $calculatorSnapshot,
        (int) $property['price'],
        (float) ($property['interest_rate'] ?? 6.5)
    );
    $calculatorJson = json_encode($validatedCalculator);
    if ($calculatorJson === false) {
        send_json(500, ['ok' => false, 'error' => 'Failed to store calculator details']);
    }

    $expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));
    $ins = $mysqli->prepare(
        'INSERT INTO reservations (property_id, user_id, status, expires_at, notes, payment_intent, calculator_snapshot)
         VALUES (?, ?, \'pending\', ?, ?, ?, ?)'
    );
    $userId = (int) $user['id'];
    $ins->bind_param('iissss', $propertyId, $userId, $expiresAt, $notes, $paymentIntent, $calculatorJson);
    $ins->execute();

    $newId = (int) $mysqli->insert_id;
    set_property_status($mysqli, $propertyId, 'reserved');
    audit_log($mysqli, $userId, 'CREATE', 'reservation', $newId, "Reservation requested for property #{$propertyId} ({$days} days)");

    $userName = $user['first_name'] . ' ' . $user['last_name'];
    create_notification($mysqli, (int) $property['owner_id'], 'reservation', 'New Reservation Request', "{$userName} reserved \"{$property['title']}\" for {$days} days. Payment intent: {$paymentIntent}.", 'reservation', $newId);

    $sel = $mysqli->prepare($selectSql . ' WHERE r.id = ? LIMIT 1');
    $sel->bind_param('i', $newId);
    $sel->execute();
    $newRow = $sel->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_reservation_row($newRow)]);
}

if ($method === 'PUT' || $method === 'PATCH') {
    $user = require_auth($mysqli);
    expire_stale_reservations_and_release_properties($mysqli);
    $body = get_json_body();

    $resId = isset($_GET['id']) ? (int) $_GET['id'] : (int) ($body['id'] ?? 0);
    if ($resId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Reservation ID is required']);
    }

    $stmt = $mysqli->prepare('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $resId);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Reservation not found']);
    }

    $propStmt = $mysqli->prepare('SELECT owner_id, title, status FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $propStmt->bind_param('i', $existing['property_id']);
    $propStmt->execute();
    $property = $propStmt->get_result()->fetch_assoc();
    if (!$property) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }

    $role = (string) ($user['user_type'] ?? '');
    $isPrivileged = in_array($role, ['administrator', 'clerk'], true);
    $isReservationOwner = (int) $existing['user_id'] === (int) $user['id'];
    $isPropertyOwner = (int) $property['owner_id'] === (int) $user['id'];
    if (!$isPrivileged && !$isReservationOwner && !$isPropertyOwner) {
        send_json(403, ['ok' => false, 'error' => 'Not authorized']);
    }

    $newStatus = trim((string) ($body['status'] ?? ''));
    if (!in_array($newStatus, ['active', 'cancelled', 'completed'], true)) {
        send_json(422, ['ok' => false, 'error' => 'Status must be active, cancelled, or completed']);
    }

    if ($newStatus === 'active') {
        if (!$isPrivileged) {
            send_json(403, ['ok' => false, 'error' => 'Only clerks or administrators can activate reservations']);
        }
        if ((string) $existing['status'] !== 'pending') {
            send_json(422, ['ok' => false, 'error' => 'Only pending reservations can be activated']);
        }

        $paymentStmt = $mysqli->prepare(
            "SELECT id
             FROM payments
             WHERE reservation_id = ?
               AND status = 'paid'
               AND payment_type IN ('reservation', 'down_payment')
             ORDER BY created_at DESC
             LIMIT 1"
        );
        $paymentStmt->bind_param('i', $resId);
        $paymentStmt->execute();
        if (!$paymentStmt->get_result()->fetch_assoc()) {
            send_json(422, ['ok' => false, 'error' => 'Payment must be validated before the reservation can be activated']);
        }
    }

    if ($newStatus === 'completed') {
        if (!$isPrivileged) {
            send_json(403, ['ok' => false, 'error' => 'Only clerks or administrators can complete reservations']);
        }
        if ((string) $property['status'] !== 'sold') {
            send_json(422, ['ok' => false, 'error' => 'Reservations can only be completed after the property is sold']);
        }
    }

    if ($newStatus === 'cancelled' && (string) $property['status'] === 'sold') {
        send_json(422, ['ok' => false, 'error' => 'Sold properties can no longer have their reservation cancelled']);
    }

    $upd = $mysqli->prepare('UPDATE reservations SET status = ? WHERE id = ?');
    $upd->bind_param('si', $newStatus, $resId);
    $upd->execute();

    audit_log($mysqli, (int) $user['id'], 'UPDATE', 'reservation', $resId, "Reservation {$newStatus}");

    if ($newStatus === 'active') {
        set_property_status($mysqli, (int) $existing['property_id'], 'reserved');
        $agentName = $user['first_name'] . ' ' . $user['last_name'];
        $expiresFormatted = date('M j, Y', strtotime((string) $existing['expires_at']));
        create_notification(
            $mysqli,
            (int) $existing['user_id'],
            'reservation',
            'Reservation Activated',
            "Your reservation for \"{$property['title']}\" is now active. Confirmed by {$agentName}. It expires on {$expiresFormatted}.",
            'reservation',
            $resId
        );
    }

    if ($newStatus === 'cancelled') {
        sync_property_status($mysqli, (int) $existing['property_id']);
        if (!$isReservationOwner) {
            $agentName = $user['first_name'] . ' ' . $user['last_name'];
            create_notification(
                $mysqli,
                (int) $existing['user_id'],
                'reservation',
                'Reservation Cancelled',
                "Your reservation for \"{$property['title']}\" was cancelled by {$agentName}.",
                'reservation',
                $resId
            );
        }
    }

    if ($newStatus === 'completed') {
        sync_property_status($mysqli, (int) $existing['property_id']);
    }

    $sel = $mysqli->prepare($selectSql . ' WHERE r.id = ? LIMIT 1');
    $sel->bind_param('i', $resId);
    $sel->execute();
    $updated = $sel->get_result()->fetch_assoc();

    send_json(200, ['ok' => true, 'data' => build_reservation_row($updated)]);
}

if ($method === 'DELETE') {
    $user = require_auth($mysqli);
    require_role($user, ['administrator']);

    $id = get_request_id();

    $sel = $mysqli->prepare('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Reservation not found']);
    }

    soft_delete($mysqli, 'reservations', $id);
    sync_property_status($mysqli, (int) $existing['property_id']);
    audit_log($mysqli, (int) $user['id'], 'DELETE', 'reservation', $id, 'Soft deleted reservation');

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
