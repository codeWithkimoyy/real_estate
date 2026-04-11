<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = require_auth($mysqli);

// ── GET ──────────────────────────────────────────────────

if ($method === 'GET') {
    $uid = (int) $user['id'];
    $stmt = $mysqli->prepare(
        'SELECT f.id, f.property_id, f.created_at,
                p.title, p.city, p.province, p.price, p.beds, p.baths, p.sqm,
                p.image, p.status, p.property_type
         FROM favorites f
         JOIN properties p ON p.id = f.property_id
         WHERE f.user_id = ?
         ORDER BY f.created_at DESC'
    );
    $stmt->bind_param('i', $uid);
    $stmt->execute();
    $result = $stmt->get_result();

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'id'         => (int) $row['id'],
            'propertyId' => (int) $row['property_id'],
            'createdAt'  => (string) $row['created_at'],
            'property'   => [
                'id'           => (int) $row['property_id'],
                'title'        => (string) $row['title'],
                'city'         => (string) $row['city'],
                'province'     => (string) $row['province'],
                'price'        => (int) $row['price'],
                'beds'         => (int) $row['beds'],
                'baths'        => (int) $row['baths'],
                'sqm'          => (int) $row['sqm'],
                'image'        => (string) $row['image'],
                'status'       => (string) $row['status'],
                'propertyType' => (string) $row['property_type'],
            ],
        ];
    }
    send_json(200, ['ok' => true, 'data' => $rows]);
}

// ── POST (add favorite) ─────────────────────────────────

if ($method === 'POST') {
    $body       = get_json_body();
    $propertyId = (int) ($body['propertyId'] ?? 0);
    $uid        = (int) $user['id'];

    if ($propertyId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }

    // Check property exists
    $chk = $mysqli->prepare('SELECT id FROM properties WHERE id = ? LIMIT 1');
    $chk->bind_param('i', $propertyId);
    $chk->execute();
    if (!$chk->get_result()->fetch_assoc()) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }

    // Upsert (ignore if already exists)
    $ins = $mysqli->prepare('INSERT IGNORE INTO favorites (user_id, property_id) VALUES (?, ?)');
    $ins->bind_param('ii', $uid, $propertyId);
    $ins->execute();

    send_json(200, ['ok' => true, 'data' => ['propertyId' => $propertyId, 'favorited' => true]]);
}

// ── DELETE ───────────────────────────────────────────────

if ($method === 'DELETE') {
    $body       = get_json_body();
    $propertyId = (int) ($body['propertyId'] ?? ($_GET['propertyId'] ?? 0));
    $uid        = (int) $user['id'];

    if ($propertyId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }

    $del = $mysqli->prepare('DELETE FROM favorites WHERE user_id = ? AND property_id = ?');
    $del->bind_param('ii', $uid, $propertyId);
    $del->execute();

    send_json(200, ['ok' => true, 'data' => ['propertyId' => $propertyId, 'favorited' => false]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
