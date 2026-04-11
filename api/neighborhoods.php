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
    $stmt = $mysqli->prepare('SELECT * FROM neighborhoods WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        send_json(404, ['ok' => false, 'error' => 'Neighborhood not found']);
    }
    send_json(200, ['ok' => true, 'data' => [
        'id'           => (int) $row['id'],
        'name'         => (string) $row['name'],
        'city'         => (string) $row['city'],
        'province'     => (string) $row['province'],
        'image'        => (string) $row['image'],
        'avgPrice'     => (int) $row['avg_price'],
        'priceChange'  => (float) $row['price_change'],
        'description'  => (string) $row['description'],
        'walkScore'    => (int) $row['walk_score'],
        'transitScore' => (int) $row['transit_score'],
    ]]);
}

$result = $mysqli->query('SELECT * FROM neighborhoods ORDER BY avg_price DESC');
$rows   = [];
while ($row = $result->fetch_assoc()) {
    $rows[] = [
        'id'           => (int) $row['id'],
        'name'         => (string) $row['name'],
        'city'         => (string) $row['city'],
        'province'     => (string) $row['province'],
        'image'        => (string) $row['image'],
        'avgPrice'     => (int) $row['avg_price'],
        'priceChange'  => (float) $row['price_change'],
        'description'  => (string) $row['description'],
        'walkScore'    => (int) $row['walk_score'],
        'transitScore' => (int) $row['transit_score'],
    ];
}

send_json(200, ['ok' => true, 'data' => $rows]);
