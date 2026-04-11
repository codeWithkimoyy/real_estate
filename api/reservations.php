<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

// ── Helper: expire stale reservations ────────────────────

function expire_stale(mysqli $mysqli): void
{
    $mysqli->query("UPDATE reservations SET status = 'expired' WHERE status IN ('active','pending') AND expires_at < NOW() AND deleted_at IS NULL");
}

// ── Helper: build reservation row ────────────────────────

function build_reservation_row(array $row): array
{
    return [
        'id'           => (int) $row['id'],
        'propertyId'   => (int) $row['property_id'],
        'propertyTitle' => (string) ($row['property_title'] ?? ''),
        'propertyImage' => (string) ($row['property_image'] ?? ''),
        'propertyAddress' => (string) ($row['property_address'] ?? ''),
        'propertyCity' => (string) ($row['property_city'] ?? ''),
        'propertyProvince' => (string) ($row['property_province'] ?? ''),
        'userId'       => (int) $row['user_id'],
        'userName'     => (string) ($row['user_name'] ?? ''),
        'ownerName'    => (string) ($row['owner_name'] ?? ''),
        'status'       => (string) $row['status'],
        'expiresAt'    => (string) $row['expires_at'],
        'notes'        => $row['notes'] ?? null,
        'createdAt'    => (string) $row['created_at'],
        'updatedAt'    => (string) $row['updated_at'],
    ];
}

$selectSql = 'SELECT r.*, p.title AS property_title, p.image AS property_image,
              p.address AS property_address, p.city AS property_city, p.province AS property_province,
              CONCAT(u.first_name, " ", u.last_name) AS user_name,
              CONCAT(o.first_name, " ", o.last_name) AS owner_name
              FROM reservations r
              JOIN properties p ON p.id = r.property_id
              JOIN users u ON u.id = r.user_id
              JOIN users o ON o.id = p.owner_id';

// ── GET ──────────────────────────────────────────────────

if ($method === 'GET') {
    $user = require_auth($mysqli);
    expire_stale($mysqli);

    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    $propertyId = isset($_GET['property_id']) ? (int) $_GET['property_id'] : 0;

    if ($id > 0) {
        $stmt = $mysqli->prepare($selectSql . ' WHERE r.id = ? AND r.deleted_at IS NULL LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) send_json(404, ['ok' => false, 'error' => 'Reservation not found']);

        // IDOR protection: only the reservation owner, property owner, admin, or clerk can view
        $isAdmin = in_array($user['user_type'], ['administrator', 'clerk'], true);
        if (!$isAdmin && (int) $row['user_id'] !== (int) $user['id']) {
            // Check if the current user owns the property
            $propOwnerStmt = $mysqli->prepare('SELECT owner_id FROM properties WHERE id = ? LIMIT 1');
            $propOwnerStmt->bind_param('i', $row['property_id']);
            $propOwnerStmt->execute();
            $propOwner = $propOwnerStmt->get_result()->fetch_assoc();
            if (!$propOwner || (int) $propOwner['owner_id'] !== (int) $user['id']) {
                send_json(403, ['ok' => false, 'error' => 'You do not have permission to view this reservation']);
            }
        }

        send_json(200, ['ok' => true, 'data' => build_reservation_row($row)]);
    }

    if ($propertyId > 0) {
        // IDOR protection: only allow property owner, admin, clerk, or active reserver
        $isAdmin = in_array($user['user_type'], ['administrator', 'clerk'], true);
        if (!$isAdmin) {
            $propOwnerStmt = $mysqli->prepare('SELECT owner_id FROM properties WHERE id = ? LIMIT 1');
            $propOwnerStmt->bind_param('i', $propertyId);
            $propOwnerStmt->execute();
            $propOwner = $propOwnerStmt->get_result()->fetch_assoc();
            $isPropertyOwner = $propOwner && (int) $propOwner['owner_id'] === (int) $user['id'];

            if (!$isPropertyOwner) {
                // Non-owners can only see their own reservations for this property
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

    // Paginated list
    $pagination = get_pagination_params(20, 100);
    $isAdmin = in_array($user['user_type'], ['administrator', 'clerk'], true);

    $where  = ['r.deleted_at IS NULL'];
    $params = [];
    $types  = '';

    if (!$isAdmin) {
        // Show reservations the user created OR reservations on their own properties
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

// ── POST (create reservation) ────────────────────────────

if ($method === 'POST') {
    $user = require_auth($mysqli);
    expire_stale($mysqli);
    $body = get_json_body();

    check_rate_limit($mysqli, 'create_reservation', 'user:' . $user['id'], 5, 3600);

    $propertyId = (int) ($body['propertyId'] ?? 0);
    $days = (int) ($body['days'] ?? 7);
    $notes = sanitize_string((string) ($body['notes'] ?? ''), 500);

    if ($propertyId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }
    if ($days < 1 || $days > 90) {
        send_json(422, ['ok' => false, 'error' => 'Reservation period must be 1–90 days']);
    }

    $pStmt = $mysqli->prepare('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $pStmt->bind_param('i', $propertyId);
    $pStmt->execute();
    $property = $pStmt->get_result()->fetch_assoc();
    if (!$property) send_json(404, ['ok' => false, 'error' => 'Property not found']);
    if ($property['status'] !== 'approved') {
        send_json(422, ['ok' => false, 'error' => 'Property is not available for reservation']);
    }

    if ((int) $property['owner_id'] === (int) $user['id']) {
        send_json(422, ['ok' => false, 'error' => 'You cannot reserve your own property']);
    }

    $chk = $mysqli->prepare("SELECT id FROM reservations WHERE property_id = ? AND status IN ('pending','active') AND deleted_at IS NULL LIMIT 1");
    $chk->bind_param('i', $propertyId);
    $chk->execute();
    if ($chk->get_result()->fetch_assoc()) {
        send_json(409, ['ok' => false, 'error' => 'This property already has a pending or active reservation']);
    }

    $expiresAt = date('Y-m-d H:i:s', strtotime("+{$days} days"));

    $ins = $mysqli->prepare(
        'INSERT INTO reservations (property_id, user_id, status, expires_at, notes) VALUES (?, ?, \'pending\', ?, ?)'
    );
    $userId = (int) $user['id'];
    $ins->bind_param('iiss', $propertyId, $userId, $expiresAt, $notes);
    $ins->execute();

    $newId = (int) $mysqli->insert_id;
    audit_log($mysqli, $userId, 'CREATE', 'reservation', $newId, "Reservation requested for property #{$propertyId} ({$days} days)");

    // Notify property owner about the pending reservation request
    $userName = $user['first_name'] . ' ' . $user['last_name'];
    create_notification($mysqli, (int) $property['owner_id'], 'reservation', 'New Reservation Request', "{$userName} wants to reserve \"{$property['title']}\" for {$days} days. Please confirm or cancel.", 'reservation', $newId);

    $sel = $mysqli->prepare($selectSql . ' WHERE r.id = ? LIMIT 1');
    $sel->bind_param('i', $newId);
    $sel->execute();
    $newRow = $sel->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_reservation_row($newRow)]);
}

// ── PUT / PATCH (update status) ──────────────────────────

if ($method === 'PUT' || $method === 'PATCH') {
    $user = require_auth($mysqli);
    expire_stale($mysqli);
    $body = get_json_body();

    $resId = isset($_GET['id']) ? (int) $_GET['id'] : (int) ($body['id'] ?? 0);
    if ($resId <= 0) send_json(422, ['ok' => false, 'error' => 'Reservation ID is required']);

    $stmt = $mysqli->prepare('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $resId);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    if (!$existing) send_json(404, ['ok' => false, 'error' => 'Reservation not found']);

    $isAdmin = $user['user_type'] === 'administrator';
    $isReservationOwner = (int) $existing['user_id'] === (int) $user['id'];

    // Check if the current user is the property owner (agent/seller)
    $pOwnerStmt = $mysqli->prepare('SELECT owner_id, title FROM properties WHERE id = ? LIMIT 1');
    $pOwnerStmt->bind_param('i', $existing['property_id']);
    $pOwnerStmt->execute();
    $pOwnerRow = $pOwnerStmt->get_result()->fetch_assoc();
    $isPropertyOwner = $pOwnerRow && (int) $pOwnerRow['owner_id'] === (int) $user['id'];

    if (!$isAdmin && !$isReservationOwner && !$isPropertyOwner) {
        send_json(403, ['ok' => false, 'error' => 'Not authorized']);
    }

    $newStatus = trim((string) ($body['status'] ?? ''));
    $allowed = ['active', 'cancelled', 'completed'];
    if (!in_array($newStatus, $allowed, true)) {
        send_json(422, ['ok' => false, 'error' => 'Status must be active, cancelled, or completed']);
    }

    // Only property owner or admin can confirm (set active)
    if ($newStatus === 'active') {
        if (!$isPropertyOwner && !$isAdmin) {
            send_json(403, ['ok' => false, 'error' => 'Only the property owner or admin can confirm a reservation']);
        }
        if ($existing['status'] !== 'pending') {
            send_json(422, ['ok' => false, 'error' => 'Only pending reservations can be confirmed']);
        }
    }

    $upd = $mysqli->prepare('UPDATE reservations SET status = ? WHERE id = ?');
    $upd->bind_param('si', $newStatus, $resId);
    $upd->execute();

    audit_log($mysqli, (int) $user['id'], 'UPDATE', 'reservation', $resId, "Reservation {$newStatus}");

    // When confirmed (active), notify the buyer that reservation is active
    if ($newStatus === 'active') {
        $agentName = $user['first_name'] . ' ' . $user['last_name'];
        $propTitle = $pOwnerRow['title'] ?? 'the property';
        $expiresFormatted = date('M j, Y', strtotime($existing['expires_at']));
        create_notification(
            $mysqli,
            (int) $existing['user_id'],
            'reservation',
            'Reservation Confirmed',
            "Your reservation for \"{$propTitle}\" has been confirmed by {$agentName}. It is now active until {$expiresFormatted}.",
            'reservation',
            $resId
        );
    }

    // When cancelled by property owner/admin, notify the buyer
    if ($newStatus === 'cancelled' && !$isReservationOwner) {
        $agentName = $user['first_name'] . ' ' . $user['last_name'];
        $propTitle = $pOwnerRow['title'] ?? 'the property';
        create_notification(
            $mysqli,
            (int) $existing['user_id'],
            'reservation',
            'Reservation Cancelled',
            "Your reservation for \"{$propTitle}\" was cancelled by {$agentName}.",
            'reservation',
            $resId
        );
    }

    $sel = $mysqli->prepare($selectSql . ' WHERE r.id = ? LIMIT 1');
    $sel->bind_param('i', $resId);
    $sel->execute();
    $updated = $sel->get_result()->fetch_assoc();

    send_json(200, ['ok' => true, 'data' => build_reservation_row($updated)]);
}

// ── DELETE (soft delete) ─────────────────────────────────

if ($method === 'DELETE') {
    $user = require_auth($mysqli);
    require_role($user, ['administrator']);

    $id = get_request_id();

    $sel = $mysqli->prepare('SELECT * FROM reservations WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    if (!$sel->get_result()->fetch_assoc()) {
        send_json(404, ['ok' => false, 'error' => 'Reservation not found']);
    }

    soft_delete($mysqli, 'reservations', $id);
    audit_log($mysqli, (int) $user['id'], 'DELETE', 'reservation', $id, 'Soft deleted reservation');

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
