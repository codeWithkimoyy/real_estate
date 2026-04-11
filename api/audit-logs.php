<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$user = require_auth($mysqli);
require_role($user, ['administrator']);

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$pagination   = get_pagination_params(50, 200);
$actionFilter = isset($_GET['action']) ? trim($_GET['action']) : '';
$userFilter   = isset($_GET['user_id']) ? (int) $_GET['user_id'] : 0;
$resourceType = isset($_GET['resource_type']) ? trim($_GET['resource_type']) : '';

$where  = [];
$params = [];
$types  = '';

if ($actionFilter !== '') { $where[] = 'a.action = ?'; $params[] = $actionFilter; $types .= 's'; }
if ($userFilter > 0)      { $where[] = 'a.user_id = ?'; $params[] = $userFilter; $types .= 'i'; }
if ($resourceType !== '')  { $where[] = 'a.resource_type = ?'; $params[] = $resourceType; $types .= 's'; }

$whereSql = $where ? ' WHERE ' . implode(' AND ', $where) : '';

// Count
$countSql = "SELECT COUNT(*) AS total FROM audit_logs a{$whereSql}";
if ($params) {
    $cStmt = $mysqli->prepare($countSql);
    $cStmt->bind_param($types, ...$params);
    $cStmt->execute();
    $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
} else {
    $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
}

$sql = "SELECT a.*, CONCAT(u.first_name, ' ', u.last_name) AS user_name
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        {$whereSql}
        ORDER BY a.created_at DESC
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
    $rows[] = [
        'id'           => (int) $row['id'],
        'userId'       => $row['user_id'] ? (int) $row['user_id'] : null,
        'userName'     => $row['user_name'] ?? 'System',
        'action'       => (string) $row['action'],
        'resourceType' => (string) $row['resource_type'],
        'resourceId'   => $row['resource_id'] ? (int) $row['resource_id'] : null,
        'details'      => $row['details'],
        'ipAddress'    => $row['ip_address'],
        'createdAt'    => (string) $row['created_at'],
    ];
}

send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
