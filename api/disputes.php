<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = require_auth($mysqli);

// ── GET – List disputes ──────────────────────────────────

if ($method === 'GET') {
    $pagination = get_pagination_params(20, 100);
    $uid  = (int) $user['id'];
    $role = $user['user_type'];

    $where  = [];
    $params = [];
    $types  = '';

    if ($role !== 'administrator' && $role !== 'clerk') {
        $where[]  = 'd.reporter_id = ?';
        $params[] = $uid;
        $types   .= 'i';
    }

    if (!empty($_GET['status'])) {
        $where[]  = 'd.status = ?';
        $params[] = trim($_GET['status']);
        $types   .= 's';
    }

    $whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

    $countSql = "SELECT COUNT(*) AS total FROM disputes d{$whereSql}";
    if ($params) {
        $cStmt = $mysqli->prepare($countSql);
        $cStmt->bind_param($types, ...$params);
        $cStmt->execute();
        $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = "SELECT d.*,
                   CONCAT(rp.first_name, ' ', rp.last_name) AS reporter_name,
                   rp.email AS reporter_email,
                   CONCAT(rv.first_name, ' ', rv.last_name) AS resolved_by_name
            FROM disputes d
            JOIN users rp ON rp.id = d.reporter_id
            LEFT JOIN users rv ON rv.id = d.resolved_by
            {$whereSql}
            ORDER BY d.created_at DESC
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
        $rows[] = build_dispute_row($row);
    }

    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

// ── POST – Create dispute ────────────────────────────────

if ($method === 'POST') {
    $body = get_json_body();

    check_rate_limit($mysqli, 'create_dispute', 'user:' . $user['id'], 3, 3600);

    $resourceType = sanitize_string((string) ($body['resourceType'] ?? ''), 50);
    $resourceId   = isset($body['resourceId']) ? (int) $body['resourceId'] : 0;
    $reason       = sanitize_string((string) ($body['reason'] ?? ''), 100);
    $description  = sanitize_string((string) ($body['description'] ?? ''), 2000);

    if ($reason === '' || $resourceType === '' || $resourceId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Resource type, resource ID, and reason are required']);
    }

    $validTypes = ['property', 'payment', 'user'];
    if (!in_array($resourceType, $validTypes, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid resource type']);
    }

    $reporterId = (int) $user['id'];

    $ins = $mysqli->prepare(
        'INSERT INTO disputes (reporter_id, reference_type, reference_id, reason, description) VALUES (?, ?, ?, ?, ?)'
    );
    $ins->bind_param('isiss', $reporterId, $resourceType, $resourceId, $reason, $description);
    $ins->execute();

    $newId = (int) $mysqli->insert_id;
    audit_log($mysqli, $reporterId, 'CREATE', 'dispute', $newId, 'Filed dispute');

    // Notify admins
    $admins = $mysqli->query("SELECT id FROM users WHERE user_type = 'administrator' AND deleted_at IS NULL");
    $reporterName = $user['first_name'] . ' ' . $user['last_name'];
    while ($admin = $admins->fetch_assoc()) {
        create_notification($mysqli, (int) $admin['id'], 'system', 'New Dispute', "{$reporterName} filed a dispute. Review required.", 'dispute', $newId);
    }

    send_json(201, ['ok' => true, 'data' => ['id' => $newId, 'status' => 'open']]);
}

// ── PATCH – Resolve dispute (admin only) ─────────────────

if ($method === 'PATCH') {
    require_role($user, ['administrator']);

    $body = get_json_body();
    $id   = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($id <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Dispute ID is required']);
    }

    $sel = $mysqli->prepare('SELECT * FROM disputes WHERE id = ? LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Dispute not found']);
    }

    $newStatus  = trim((string) ($body['status'] ?? ''));
    $adminNotes = sanitize_string((string) ($body['adminNotes'] ?? ''), 2000);
    $valid      = ['investigating', 'resolved', 'dismissed'];
    if (!in_array($newStatus, $valid, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid status']);
    }

    $uid = (int) $user['id'];
    $now = date('Y-m-d H:i:s');

    $upd = $mysqli->prepare('UPDATE disputes SET status = ?, resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?');
    $upd->bind_param('ssisi', $newStatus, $adminNotes, $uid, $now, $id);
    $upd->execute();

    audit_log($mysqli, $uid, 'UPDATE', 'dispute', $id, "Dispute {$newStatus}");

    // Notify reporter
    create_notification($mysqli, (int) $existing['reporter_id'], 'system', "Dispute {$newStatus}", "Your dispute has been updated to: {$newStatus}.", 'dispute', $id);

    send_json(200, ['ok' => true, 'data' => [
        'id'         => $id,
        'status'     => $newStatus,
        'adminNotes' => $adminNotes,
        'resolvedBy' => $uid,
        'resolvedAt' => $now,
    ]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);

// ── Helper ───────────────────────────────────────────────

function build_dispute_row(array $row): array
{
    return [
        'id'             => (int) $row['id'],
        'reporterId'     => (int) $row['reporter_id'],
        'reporterName'   => (string) ($row['reporter_name'] ?? ''),
        'reporterEmail'  => (string) ($row['reporter_email'] ?? ''),
        'resourceType'   => (string) $row['reference_type'],
        'resourceId'     => (int) $row['reference_id'],
        'reason'         => (string) $row['reason'],
        'description'    => $row['description'],
        'status'         => (string) $row['status'],
        'adminNotes'     => $row['resolution'],
        'resolvedBy'     => $row['resolved_by'] ? (int) $row['resolved_by'] : null,
        'resolvedByName' => $row['resolved_by_name'] ?? null,
        'resolvedAt'     => $row['resolved_at'],
        'createdAt'      => (string) $row['created_at'],
        'updatedAt'      => (string) ($row['updated_at'] ?? ''),
    ];
}
