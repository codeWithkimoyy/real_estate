<?php

declare(strict_types=1);

$baseUrl = rtrim((string) (getenv('API_BASE_URL') ?: 'http://localhost/Activities/real_estate/api'), '/');
$token = (string) (getenv('API_BEARER_TOKEN') ?: '');

function fail(string $message): never
{
    fwrite(STDERR, "[FAIL] {$message}\n");
    exit(1);
}

function pass(string $message): void
{
    fwrite(STDOUT, "[PASS] {$message}\n");
}

function request_json(string $url, string $method = 'GET', ?string $token = null): array
{
    $ch = curl_init($url);
    if ($ch === false) {
        fail('Unable to initialize cURL');
    }

    $headers = ['Accept: application/json'];
    if ($token) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_TIMEOUT => 15,
    ]);

    $raw = curl_exec($ch);
    if ($raw === false) {
        $err = curl_error($ch);
        curl_close($ch);
        fail('cURL request failed: ' . $err);
    }

    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    $json = json_decode($raw, true);
    if (!is_array($json)) {
        fail("Non-JSON response from {$url} (status {$status})");
    }

    return ['status' => $status, 'body' => $json];
}

function assert_envelope(array $body, string $label): void
{
    if (!array_key_exists('success', $body)) {
        fail("{$label}: missing success");
    }
    if (!array_key_exists('ok', $body)) {
        fail("{$label}: missing ok");
    }
    if (!array_key_exists('requestId', $body)) {
        fail("{$label}: missing requestId");
    }
}

// Public endpoint should return standard success envelope.
$public = request_json($baseUrl . '/market-insights.php');
assert_envelope($public['body'], 'market-insights');
if ($public['status'] !== 200) {
    fail('market-insights expected 200');
}
if (($public['body']['success'] ?? false) !== true) {
    fail('market-insights success should be true');
}
pass('Public endpoint envelope is valid');

// Protected endpoint should return standardized auth error when no token.
$protected = request_json($baseUrl . '/notifications.php');
assert_envelope($protected['body'], 'notifications (unauthenticated)');
if ($protected['status'] !== 401) {
    fail('notifications without token expected 401');
}
if (!isset($protected['body']['error']['code']) || !isset($protected['body']['error']['message'])) {
    fail('notifications unauthenticated missing structured error object');
}
pass('Protected endpoint returns standardized auth error envelope');

// Optional authenticated endpoint check.
if ($token !== '') {
    $auth = request_json($baseUrl . '/notifications.php', 'GET', $token);
    assert_envelope($auth['body'], 'notifications (authenticated)');
    if ($auth['status'] !== 200) {
        fail('notifications with token expected 200');
    }
    pass('Authenticated endpoint envelope is valid');
} else {
    pass('Skipping authenticated test (API_BEARER_TOKEN not provided)');
}

pass('All contract smoke checks passed');
