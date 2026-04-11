<?php

declare(strict_types=1);

/*
  Google login endpoint template.
  Move or adapt this file into /api/google-auth.php when wiring it into the app.
*/

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '{}', true);
$idToken = isset($body['idToken']) ? trim((string) $body['idToken']) : '';

if ($idToken === '') {
    http_response_code(422);
    echo json_encode(['ok' => false, 'error' => 'idToken is required']);
    exit;
}

// TODO: Verify token with Google endpoint:
// https://oauth2.googleapis.com/tokeninfo?id_token=YOUR_ID_TOKEN
// Then extract sub/email/name/picture and upsert user in local DB.

http_response_code(501);
echo json_encode([
    'ok' => false,
    'error' => 'Google auth scaffold created. Verification and user sync not implemented yet.',
]);
