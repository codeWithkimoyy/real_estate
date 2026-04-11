<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
if ($id > 0) {
    $stmt = $mysqli->prepare('SELECT * FROM testimonials WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        send_json(404, ['ok' => false, 'error' => 'Testimonial not found']);
    }
    send_json(200, ['ok' => true, 'data' => [
        'id'      => (int) $row['id'],
        'name'    => (string) $row['name'],
        'role'    => (string) $row['role'],
        'image'   => (string) $row['image'],
        'content' => (string) $row['content'],
        'rating'  => (int) $row['rating'],
    ]]);
}

$result = $mysqli->query('SELECT * FROM testimonials ORDER BY created_at DESC');
$rows   = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = [
        'id'      => (int) $row['id'],
        'name'    => (string) $row['name'],
        'role'    => (string) $row['role'],
        'image'   => (string) $row['image'],
        'content' => (string) $row['content'],
        'rating'  => (int) $row['rating'],
    ];
}

send_json(200, ['ok' => true, 'data' => $rows]);
