<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = require_auth($mysqli);
$uid    = (int) $user['id'];

// ── GET – List notifications ─────────────────────────────

if ($method === 'GET') {
    $pagination = get_pagination_params(20, 100);
    $unreadOnly = isset($_GET['unread']) && $_GET['unread'] === '1';

    $where  = ['user_id = ?'];
    $params = [$uid];
    $types  = 'i';

    if ($unreadOnly) {
        $where[] = 'is_read = 0';
    }

    $whereSql = implode(' AND ', $where);

    // Count
    $countSql = "SELECT COUNT(*) AS total FROM notifications WHERE {$whereSql}";
    $cStmt = $mysqli->prepare($countSql);
    $cStmt->bind_param($types, ...$params);
    $cStmt->execute();
    $total = (int) $cStmt->get_result()->fetch_assoc()['total'];

    // Unread count (always include)
    $uStmt = $mysqli->prepare('SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0');
    $uStmt->bind_param('i', $uid);
    $uStmt->execute();
    $unreadCount = (int) $uStmt->get_result()->fetch_assoc()['cnt'];

    $sql = "SELECT * FROM notifications WHERE {$whereSql} ORDER BY created_at DESC LIMIT {$pagination['limit']} OFFSET {$pagination['offset']}";
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'id'           => (int) $row['id'],
            'type'         => (string) $row['type'],
            'title'        => (string) $row['title'],
            'message'      => (string) $row['message'],
            'resourceType' => $row['resource_type'],
            'resourceId'   => $row['resource_id'] ? (int) $row['resource_id'] : null,
            'readAt'       => $row['is_read'] ? (string) $row['created_at'] : null,
            'createdAt'    => (string) $row['created_at'],
        ];
    }

    $response = paginated_response($rows, $total, $pagination['page'], $pagination['limit']);
    $response['unreadCount'] = $unreadCount;
    send_json(200, $response);
}

// ── PATCH – Mark as read ─────────────────────────────────

if ($method === 'PATCH') {
    $body   = get_json_body();
    $action = trim((string) ($body['action'] ?? 'read'));

    if ($action === 'read_all') {
        $upd = $mysqli->prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0');
        $upd->bind_param('i', $uid);
        $upd->execute();
        $affected = $mysqli->affected_rows;
        send_json(200, ['ok' => true, 'data' => ['markedRead' => $affected]]);
    }

    // Mark single notification as read
    $notifId = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($notifId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Notification ID is required']);
    }

    $chk = $mysqli->prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ? LIMIT 1');
    $chk->bind_param('ii', $notifId, $uid);
    $chk->execute();
    if (!$chk->get_result()->fetch_assoc()) {
        send_json(404, ['ok' => false, 'error' => 'Notification not found']);
    }

    $upd = $mysqli->prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?');
    $upd->bind_param('ii', $notifId, $uid);
    $upd->execute();

    send_json(200, ['ok' => true, 'data' => ['id' => $notifId, 'read' => true]]);
}

// ── DELETE – Delete notification ─────────────────────────

if ($method === 'DELETE') {
    $id = get_request_id();

    $chk = $mysqli->prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ? LIMIT 1');
    $chk->bind_param('ii', $id, $uid);
    $chk->execute();
    if (!$chk->get_result()->fetch_assoc()) {
        send_json(404, ['ok' => false, 'error' => 'Notification not found']);
    }

    $del = $mysqli->prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?');
    $del->bind_param('ii', $id, $uid);
    $del->execute();

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
