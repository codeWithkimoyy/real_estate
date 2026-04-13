<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/services/NotificationService.php';

$method = $_SERVER['REQUEST_METHOD'];
$user   = require_auth($mysqli);
$uid    = (int) $user['id'];

$notificationService = new NotificationService(new NotificationRepository($mysqli));

// ── GET – List notifications ─────────────────────────────

if ($method === 'GET') {
    $pagination = get_pagination_params(20, 100);
    $unreadOnly = isset($_GET['unread']) && $_GET['unread'] === '1';
    $response = $notificationService->listForUser($uid, $unreadOnly, $pagination);
    send_json(200, $response);
}

// ── PATCH – Mark as read ─────────────────────────────────

if ($method === 'PATCH') {
    $body   = get_json_body();
    $action = trim((string) ($body['action'] ?? 'read'));

    if ($action === 'read_all') {
        $affected = $notificationService->markAllRead($uid);
        send_json(200, ['ok' => true, 'data' => ['markedRead' => $affected]]);
    }

    // Mark single notification as read
    $notifId = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($notifId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Notification ID is required']);
    }

    $notificationService->assertExistsForUser($notifId, $uid);
    $notificationService->markRead($notifId, $uid);

    send_json(200, ['ok' => true, 'data' => ['id' => $notifId, 'read' => true]]);
}

// ── DELETE – Delete notification ─────────────────────────

if ($method === 'DELETE') {
    $id = get_request_id();

    $notificationService->assertExistsForUser($id, $uid);
    $notificationService->delete($id, $uid);

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
