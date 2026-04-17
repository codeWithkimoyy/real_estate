<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = require_auth($mysqli);

function build_appointment_row(array $row): array
{
    return [
        'id'              => (int) $row['id'],
        'propertyId'      => (int) $row['property_id'],
        'propertyTitle'   => (string) ($row['property_title'] ?? ''),
        'userId'          => (int) $row['user_id'],
        'userName'        => (string) ($row['user_name'] ?? ''),
        'agentId'         => $row['agent_id'] ? (int) $row['agent_id'] : null,
        'agentName'       => $row['agent_name'] ?? null,
        'appointmentDate' => (string) $row['appointment_date'],
        'appointmentTime' => (string) $row['appointment_time'],
        'notes'           => $row['notes'],
        'appointmentType' => (string) ($row['appointment_type'] ?? 'viewing'),
        'status'          => (string) $row['status'],
        'createdAt'       => (string) $row['created_at'],
    ];
}

$baseSql = 'SELECT a.*,
                   p.title AS property_title,
                   CONCAT(u.first_name, " ", u.last_name) AS user_name,
                   CONCAT(ag.first_name, " ", ag.last_name) AS agent_name
            FROM appointments a
            JOIN properties p ON p.id = a.property_id
            JOIN users u ON u.id = a.user_id
            LEFT JOIN users ag ON ag.id = a.agent_id';

// ── GET ──────────────────────────────────────────────────

if ($method === 'GET') {
    $uid = (int) $user['id'];
    $pagination = get_pagination_params(20, 100);

    $where  = ['a.deleted_at IS NULL'];
    $params = [];
    $types  = '';

    if ($user['user_type'] === 'administrator' || $user['user_type'] === 'clerk') {
        // see all
    } else {
        $where[] = '(a.user_id = ? OR a.agent_id = ?)';
        $params[] = $uid;
        $params[] = $uid;
        $types .= 'ii';
    }

    $whereSql = implode(' AND ', $where);

    $countSql = "SELECT COUNT(*) AS total FROM appointments a WHERE {$whereSql}";
    if ($params) {
        $cStmt = $mysqli->prepare($countSql);
        $cStmt->bind_param($types, ...$params);
        $cStmt->execute();
        $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = "{$baseSql} WHERE {$whereSql} ORDER BY a.appointment_date ASC, a.appointment_time ASC
            LIMIT {$pagination['limit']} OFFSET {$pagination['offset']}";

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
        $rows[] = build_appointment_row($row);
    }
    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

// ── POST (create) ────────────────────────────────────────

if ($method === 'POST') {
    $body = get_json_body();

    check_rate_limit($mysqli, 'create_appointment', 'user:' . $user['id'], 10, 3600);

    $propertyId      = (int) ($body['propertyId'] ?? 0);
    $date            = trim((string) ($body['appointmentDate'] ?? $body['date'] ?? ''));
    $time            = trim((string) ($body['appointmentTime'] ?? $body['time'] ?? ''));
    $notes           = sanitize_string((string) ($body['notes'] ?? ''), 500);
    $appointmentType = trim((string) ($body['appointmentType'] ?? 'viewing'));
    $validTypes      = ['viewing', 'walk_in_payment'];
    if (!in_array($appointmentType, $validTypes, true)) {
        $appointmentType = 'viewing';
    }

    if ($propertyId <= 0 || $date === '' || $time === '') {
        send_json(422, ['ok' => false, 'error' => 'Property ID, date and time are required']);
    }

    // Validate date is not in the past
    if (strtotime($date) < strtotime('today')) {
        send_json(422, ['ok' => false, 'error' => 'Appointment date cannot be in the past']);
    }

    // Get property owner as the agent
    $pstmt = $mysqli->prepare('SELECT owner_id, title, status FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $pstmt->bind_param('i', $propertyId);
    $pstmt->execute();
    $prop = $pstmt->get_result()->fetch_assoc();
    if (!$prop) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }
    if (!in_array((string) ($prop['status'] ?? ''), ['available', 'reserved'], true)) {
        send_json(422, ['ok' => false, 'error' => 'This property is not open for new appointments']);
    }

    $uid     = (int) $user['id'];
    $agentId = (int) $prop['owner_id'];

    // Block if reserved by someone else
    check_reservation_lock($mysqli, $propertyId, $uid);

    if ($appointmentType === 'walk_in_payment' && !get_buyer_reservation($mysqli, $propertyId, $uid, ['pending', 'active'])) {
        send_json(422, ['ok' => false, 'error' => 'A reservation is required before scheduling a walk-in payment']);
    }

    // Prevent duplicate: same user + property + date + type still pending/confirmed
    $dupChk = $mysqli->prepare(
        "SELECT id FROM appointments WHERE user_id = ? AND property_id = ? AND appointment_date = ? AND appointment_type = ? AND status IN ('pending','confirmed') AND deleted_at IS NULL LIMIT 1"
    );
    $dupChk->bind_param('iiss', $uid, $propertyId, $date, $appointmentType);
    $dupChk->execute();
    if ($dupChk->get_result()->fetch_assoc()) {
        send_json(409, ['ok' => false, 'error' => 'You already have a pending or confirmed appointment for this property on this date']);
    }

    $notesVal = $notes !== '' ? $notes : null;

    $ins = $mysqli->prepare(
        'INSERT INTO appointments (property_id, user_id, agent_id, appointment_date, appointment_time, notes, appointment_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $ins->bind_param('iiissss', $propertyId, $uid, $agentId, $date, $time, $notesVal, $appointmentType);
    $ins->execute();

    $newId = (int) $mysqli->insert_id;
    $typeLabel = $appointmentType === 'walk_in_payment' ? 'Walk-in payment' : 'Viewing';
    audit_log($mysqli, $uid, 'CREATE', 'appointment', $newId, "{$typeLabel} on {$date} at {$time}");

    // Notify the agent/property owner
    $userName = $user['first_name'] . ' ' . $user['last_name'];
    create_notification($mysqli, $agentId, 'appointment', "New {$typeLabel}", "{$userName} booked a {$typeLabel} for \"{$prop['title']}\" on {$date}", 'appointment', $newId);

    $sel = $mysqli->prepare($baseSql . ' WHERE a.id = ? LIMIT 1');
    $sel->bind_param('i', $newId);
    $sel->execute();
    $newRow = $sel->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_appointment_row($newRow)]);
}

// ── PATCH (update status) ────────────────────────────────

if ($method === 'PATCH') {
    $body = get_json_body();
    $id   = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($id <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Appointment ID is required']);
    }

    $sel = $mysqli->prepare('SELECT * FROM appointments WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Appointment not found']);
    }

    $uid     = (int) $user['id'];
    $isPrivileged = $user['user_type'] === 'administrator' || $user['user_type'] === 'clerk';
    $isBuyer = (int) $existing['user_id'] === $uid;
    $isAgent = (int) $existing['agent_id'] === $uid;
    if (!$isPrivileged && !$isBuyer && !$isAgent) {
        send_json(403, ['ok' => false, 'error' => 'Insufficient permissions']);
    }

    $newStatus = trim((string) ($body['status'] ?? ''));
    $valid     = ['pending', 'confirmed', 'cancelled', 'completed'];
    if (!in_array($newStatus, $valid, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid status']);
    }

    if (in_array($newStatus, ['confirmed', 'completed'], true) && !$isPrivileged && !$isAgent) {
        send_json(403, ['ok' => false, 'error' => 'Only the assigned agent, clerk, or administrator can confirm or complete this appointment']);
    }
    if ($newStatus === 'completed' && $existing['appointment_type'] === 'walk_in_payment' && !$isPrivileged) {
        send_json(403, ['ok' => false, 'error' => 'Walk-in payment appointments can only be completed by clerks or administrators']);
    }

    $upd = $mysqli->prepare('UPDATE appointments SET status = ? WHERE id = ?');
    $upd->bind_param('si', $newStatus, $id);
    $upd->execute();

    audit_log($mysqli, $uid, 'UPDATE', 'appointment', $id, "Appointment {$newStatus}");

    // Notify the other party
    $notifyId = ($uid === (int) $existing['user_id']) ? (int) $existing['agent_id'] : (int) $existing['user_id'];
    if ($notifyId > 0) {
        $statusLabel = ucfirst($newStatus);
        create_notification($mysqli, $notifyId, 'appointment', "Appointment {$statusLabel}", "Your appointment has been {$newStatus}.", 'appointment', $id);
    }

    $sel2 = $mysqli->prepare($baseSql . ' WHERE a.id = ? LIMIT 1');
    $sel2->bind_param('i', $id);
    $sel2->execute();
    $updatedRow = $sel2->get_result()->fetch_assoc();

    send_json(200, ['ok' => true, 'data' => build_appointment_row($updatedRow)]);
}

// ── DELETE (soft delete) ─────────────────────────────────

if ($method === 'DELETE') {
    $id = get_request_id();

    $sel = $mysqli->prepare('SELECT * FROM appointments WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Appointment not found']);
    }

    $uid     = (int) $user['id'];
    $isAdmin = $user['user_type'] === 'administrator';
    $isOwner = (int) $existing['user_id'] === $uid || (int) $existing['agent_id'] === $uid;
    if (!$isAdmin && !$isOwner) {
        send_json(403, ['ok' => false, 'error' => 'Insufficient permissions']);
    }

    soft_delete($mysqli, 'appointments', $id);
    audit_log($mysqli, $uid, 'DELETE', 'appointment', $id, 'Soft deleted appointment');

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
