<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

function build_inquiry_row(array $row, ?array $messages = null): array
{
    $data = [
        'id'            => (int) $row['id'],
        'propertyId'    => (int) $row['property_id'],
        'propertyTitle' => (string) ($row['property_title'] ?? ''),
        'senderId'      => (int) $row['sender_id'],
        'senderName'    => (string) ($row['sender_name'] ?? ''),
        'receiverId'    => (int) $row['receiver_id'],
        'receiverName'  => (string) ($row['receiver_name'] ?? ''),
        'message'       => (string) $row['message'],
        'reply'         => $row['reply'],
        'status'        => (string) $row['status'],
        'createdAt'     => (string) $row['created_at'],
        'updatedAt'     => (string) $row['updated_at'],
    ];
    if ($messages !== null) {
        $data['messages'] = $messages;
    }
    return $data;
}

function get_inquiry_messages(mysqli $mysqli, int $inquiryId): array
{
    $stmt = $mysqli->prepare(
        'SELECT m.id, m.inquiry_id AS inquiryId, m.sender_id AS senderId,
                CONCAT(u.first_name, " ", u.last_name) AS senderName,
                m.message, m.created_at AS createdAt
         FROM inquiry_messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.inquiry_id = ?
         ORDER BY m.created_at ASC'
    );
    $stmt->bind_param('i', $inquiryId);
    $stmt->execute();
    $result = $stmt->get_result();
    $msgs = [];
    while ($r = $result->fetch_assoc()) {
        $msgs[] = [
            'id'        => (int) $r['id'],
            'inquiryId' => (int) $r['inquiryId'],
            'senderId'  => (int) $r['senderId'],
            'senderName'=> (string) $r['senderName'],
            'message'   => (string) $r['message'],
            'createdAt' => (string) $r['createdAt'],
        ];
    }
    return $msgs;
}

// ── GET ──────────────────────────────────────────────────

if ($method === 'GET') {
    $user = require_auth($mysqli);
    $pagination = get_pagination_params(20, 100);

    $where  = ['i.deleted_at IS NULL'];
    $params = [];
    $types  = '';

    if ($user['user_type'] === 'administrator' || $user['user_type'] === 'clerk') {
        // see all
    } elseif ($user['user_type'] === 'buyer') {
        $where[] = 'i.sender_id = ?';
        $params[] = (int) $user['id'];
        $types .= 'i';
    } else {
        $where[] = 'i.receiver_id = ?';
        $params[] = (int) $user['id'];
        $types .= 'i';
    }

    $whereSql = implode(' AND ', $where);

    // Count
    $countSql = "SELECT COUNT(*) AS total FROM inquiries i WHERE {$whereSql}";
    if ($params) {
        $cStmt = $mysqli->prepare($countSql);
        $cStmt->bind_param($types, ...$params);
        $cStmt->execute();
        $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = "SELECT i.*,
                p.title AS property_title,
                CONCAT(s.first_name, ' ', s.last_name) AS sender_name,
                CONCAT(r.first_name, ' ', r.last_name) AS receiver_name
            FROM inquiries i
            JOIN properties p ON p.id = i.property_id
            JOIN users s ON s.id = i.sender_id
            JOIN users r ON r.id = i.receiver_id
            WHERE {$whereSql}
            ORDER BY i.created_at DESC
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
        $msgs = get_inquiry_messages($mysqli, (int) $row['id']);
        $rows[] = build_inquiry_row($row, $msgs);
    }
    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

// ── POST (send inquiry) ─────────────────────────────────

if ($method === 'POST') {
    $user = require_auth($mysqli);
    $body = get_json_body();

    check_rate_limit($mysqli, 'create_inquiry', 'user:' . $user['id'], 10, 3600);

    $propertyId = (int) ($body['propertyId'] ?? 0);
    $message    = trim((string) ($body['message'] ?? ''));

    if ($propertyId <= 0 || $message === '') {
        send_json(422, ['ok' => false, 'error' => 'Property ID and message are required']);
    }

    $message = sanitize_string($message, 2000);

    // Get property owner
    $stmt = $mysqli->prepare('SELECT owner_id, title, status FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $propertyId);
    $stmt->execute();
    $prop = $stmt->get_result()->fetch_assoc();
    if (!$prop) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }
    if (!in_array((string) ($prop['status'] ?? ''), ['available', 'reserved'], true)) {
        send_json(422, ['ok' => false, 'error' => 'This property is not open for new inquiries']);
    }

    $senderId   = (int) $user['id'];
    $receiverId = (int) $prop['owner_id'];

    if ($senderId === $receiverId) {
        send_json(400, ['ok' => false, 'error' => 'Cannot send inquiry on your own property']);
    }

    // Block if reserved by someone else
    check_reservation_lock($mysqli, $propertyId, $senderId);

    $ins = $mysqli->prepare(
        'INSERT INTO inquiries (property_id, sender_id, receiver_id, message) VALUES (?, ?, ?, ?)'
    );
    $ins->bind_param('iiis', $propertyId, $senderId, $receiverId, $message);
    $ins->execute();

    $newId = (int) $mysqli->insert_id;
    audit_log($mysqli, $senderId, 'CREATE', 'inquiry', $newId, "Inquiry on property: {$prop['title']}");

    // Notify property owner
    $senderName = $user['first_name'] . ' ' . $user['last_name'];
    create_notification($mysqli, $receiverId, 'inquiry', 'New Inquiry', "{$senderName} sent an inquiry about \"{$prop['title']}\"", 'inquiry', $newId);

    // Fetch full row
    $sel = $mysqli->prepare(
        'SELECT i.*,
                p.title AS property_title,
                CONCAT(s.first_name, " ", s.last_name) AS sender_name,
                CONCAT(r.first_name, " ", r.last_name) AS receiver_name
         FROM inquiries i
         JOIN properties p ON p.id = i.property_id
         JOIN users s ON s.id = i.sender_id
         JOIN users r ON r.id = i.receiver_id
         WHERE i.id = ? LIMIT 1'
    );
    $sel->bind_param('i', $newId);
    $sel->execute();
    $newRow = $sel->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_inquiry_row($newRow)]);
}

// ── PATCH (message / reply / mark read) ──────────────────

if ($method === 'PATCH') {
    $user = require_auth($mysqli);
    $body = get_json_body();

    $inquiryId = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($inquiryId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Inquiry ID is required']);
    }

    $sel = $mysqli->prepare('SELECT * FROM inquiries WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $inquiryId);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Inquiry not found']);
    }

    $isAdmin    = $user['user_type'] === 'administrator';
    $isSender   = (int) $existing['sender_id']   === (int) $user['id'];
    $isReceiver = (int) $existing['receiver_id'] === (int) $user['id'];
    $isParticipant = $isAdmin || $isSender || $isReceiver;

    if (!$isParticipant) {
        send_json(403, ['ok' => false, 'error' => 'You are not a participant of this inquiry']);
    }

    $action = trim((string) ($body['action'] ?? ''));

    // ── Send a new message in the conversation ──
    if ($action === 'message') {
        $msgText = sanitize_string((string) ($body['message'] ?? ''), 2000);
        if ($msgText === '') {
            send_json(422, ['ok' => false, 'error' => 'Message text is required']);
        }

        $uid = (int) $user['id'];
        $ins = $mysqli->prepare('INSERT INTO inquiry_messages (inquiry_id, sender_id, message) VALUES (?, ?, ?)');
        $ins->bind_param('iis', $inquiryId, $uid, $msgText);
        $ins->execute();

        // Update inquiry status & timestamp
        $upd = $mysqli->prepare('UPDATE inquiries SET status = "replied", updated_at = NOW() WHERE id = ?');
        $upd->bind_param('i', $inquiryId);
        $upd->execute();

        // Notify the other participant
        $notifyId = $isSender ? (int) $existing['receiver_id'] : (int) $existing['sender_id'];
        $senderName = $user['first_name'] . ' ' . $user['last_name'];
        create_notification($mysqli, $notifyId, 'inquiry', 'New Message', "{$senderName} sent a message in inquiry #{$inquiryId}", 'inquiry', $inquiryId);

        audit_log($mysqli, $uid, 'MESSAGE', 'inquiry', $inquiryId, 'Sent message in inquiry');
    }
    // ── Legacy single reply (backward compat) ──
    elseif ($action === 'reply' || (isset($body['reply']) && trim((string) $body['reply']) !== '')) {
        if (!$isAdmin && !$isReceiver) {
            send_json(403, ['ok' => false, 'error' => 'Only the receiver can use legacy reply']);
        }
        $reply = sanitize_string((string) ($body['reply'] ?? ''), 2000);
        if ($reply !== '') {
            $upd = $mysqli->prepare('UPDATE inquiries SET reply = ?, status = "replied" WHERE id = ?');
            $upd->bind_param('si', $reply, $inquiryId);
            $upd->execute();
            audit_log($mysqli, (int) $user['id'], 'REPLY', 'inquiry', $inquiryId, 'Replied to inquiry');
        }
    }
    // ── Mark as read ──
    else {
        $upd = $mysqli->prepare('UPDATE inquiries SET status = "read" WHERE id = ?');
        $upd->bind_param('i', $inquiryId);
        $upd->execute();
    }

    // Return updated row with messages
    $sel2 = $mysqli->prepare(
        'SELECT i.*,
                p.title AS property_title,
                CONCAT(s.first_name, " ", s.last_name) AS sender_name,
                CONCAT(r.first_name, " ", r.last_name) AS receiver_name
         FROM inquiries i
         JOIN properties p ON p.id = i.property_id
         JOIN users s ON s.id = i.sender_id
         JOIN users r ON r.id = i.receiver_id
         WHERE i.id = ? LIMIT 1'
    );
    $sel2->bind_param('i', $inquiryId);
    $sel2->execute();
    $updatedRow = $sel2->get_result()->fetch_assoc();
    $msgs = get_inquiry_messages($mysqli, $inquiryId);

    send_json(200, ['ok' => true, 'data' => build_inquiry_row($updatedRow, $msgs)]);
}

// ── DELETE (soft delete) ─────────────────────────────────

if ($method === 'DELETE') {
    $user = require_auth($mysqli);
    $id = get_request_id();

    $sel = $mysqli->prepare('SELECT * FROM inquiries WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Inquiry not found']);
    }

    $isAdmin  = $user['user_type'] === 'administrator';
    $isSender = (int) $existing['sender_id'] === (int) $user['id'];
    if (!$isAdmin && !$isSender) {
        send_json(403, ['ok' => false, 'error' => 'Only the sender or admin can delete an inquiry']);
    }

    soft_delete($mysqli, 'inquiries', $id);
    audit_log($mysqli, (int) $user['id'], 'DELETE', 'inquiry', $id, 'Soft deleted inquiry');

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
