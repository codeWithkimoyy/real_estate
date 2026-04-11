<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

// Agents are users with user_type = 'agent'. Return them with a listing count.

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'GET') {
    send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;

if ($id > 0) {
    $stmt = $mysqli->prepare(
        'SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar, u.bio,
                COUNT(p.id) AS listings_count
         FROM users u
         LEFT JOIN properties p ON p.owner_id = u.id AND p.status = "approved" AND p.deleted_at IS NULL
         WHERE u.id = ? AND u.user_type = "agent" AND u.deleted_at IS NULL
         GROUP BY u.id
         LIMIT 1'
    );
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        send_json(404, ['ok' => false, 'error' => 'Agent not found']);
    }

    send_json(200, ['ok' => true, 'data' => [
        'id'            => (int) $row['id'],
        'name'          => $row['first_name'] . ' ' . $row['last_name'],
        'email'         => (string) $row['email'],
        'phone'         => (string) $row['phone'],
        'avatar'        => $row['avatar'],
        'bio'           => $row['bio'],
        'listingsCount' => (int) $row['listings_count'],
    ]]);
}

// List all agents
$result = $mysqli->query(
    'SELECT u.id, u.first_name, u.last_name, u.email, u.phone, u.avatar, u.bio,
            COUNT(p.id) AS listings_count
     FROM users u
     LEFT JOIN properties p ON p.owner_id = u.id AND p.status = "approved" AND p.deleted_at IS NULL
     WHERE u.user_type = "agent" AND u.deleted_at IS NULL
     GROUP BY u.id
     ORDER BY listings_count DESC, u.first_name ASC'
);

$rows = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = [
        'id'            => (int) $row['id'],
        'name'          => $row['first_name'] . ' ' . $row['last_name'],
        'email'         => (string) $row['email'],
        'phone'         => (string) $row['phone'],
        'avatar'        => $row['avatar'],
        'bio'           => $row['bio'],
        'listingsCount' => (int) $row['listings_count'],
    ];
}

send_json(200, ['ok' => true, 'data' => $rows]);
