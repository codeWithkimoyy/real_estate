<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$user = require_auth($mysqli);
$uid = (int) $user['id'];

header('Content-Type: text/event-stream');
header('Cache-Control: no-cache, no-transform');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');

@ini_set('zlib.output_compression', '0');
@ini_set('output_buffering', 'off');
while (ob_get_level() > 0) {
    ob_end_flush();
}
ob_implicit_flush(true);

$lastPayloadHash = '';
$maxTicks = 24; // ~2 minutes at 5-second interval

for ($i = 0; $i < $maxTicks; $i++) {
    if (connection_aborted()) {
        break;
    }

    // Keep stale reservations and related counters fresh for clients.
    $mysqli->query("UPDATE reservations SET status = 'expired' WHERE status IN ('active','pending') AND expires_at < NOW() AND deleted_at IS NULL");

    $unreadStmt = $mysqli->prepare('SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = ? AND is_read = 0');
    $unreadStmt->bind_param('i', $uid);
    $unreadStmt->execute();
    $unreadCount = (int) ($unreadStmt->get_result()->fetch_assoc()['unread_count'] ?? 0);

    $latestStmt = $mysqli->prepare('SELECT id, type, title, message, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1');
    $latestStmt->bind_param('i', $uid);
    $latestStmt->execute();
    $latest = $latestStmt->get_result()->fetch_assoc() ?: null;

    $payload = [
        'success' => true,
        'data' => [
            'unreadCount' => $unreadCount,
            'latest' => $latest ? [
                'id' => (int) $latest['id'],
                'type' => (string) $latest['type'],
                'title' => (string) $latest['title'],
                'message' => (string) $latest['message'],
                'createdAt' => (string) $latest['created_at'],
            ] : null,
        ],
        'requestId' => request_id(),
        'timestamp' => gmdate('c'),
    ];

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        break;
    }

    $hash = hash('sha1', $json);
    if ($hash !== $lastPayloadHash) {
        echo "event: notifications\n";
        echo 'data: ' . $json . "\n\n";
        $lastPayloadHash = $hash;
    } else {
        echo "event: ping\n";
        echo 'data: {"timestamp":"' . gmdate('c') . '"}' . "\n\n";
    }

    flush();
    sleep(5);
}
