<?php

declare(strict_types=1);

/* =========================================================
   Shared helpers – v2 Security Overhaul
   - Security headers (CSP, X-Frame, X-Content-Type)
   - CORS restricted to allowed origins
   - Hashed session tokens (sessions table, multi-device)
   - Rate limiting (DB-based)
   - Soft deletes
   - Pagination
   - Notification helpers
   - Audit logging
   ========================================================= */

// ── Global error/exception handler (always return JSON) ──

ini_set('display_errors', '0');
error_reporting(E_ALL);

if (!defined('ESTATEFLOW_REQUEST_ID')) {
    try {
        define('ESTATEFLOW_REQUEST_ID', bin2hex(random_bytes(8)));
    } catch (Throwable $e) {
        define('ESTATEFLOW_REQUEST_ID', uniqid('req_', true));
    }
}

function request_id(): string
{
    return (string) ESTATEFLOW_REQUEST_ID;
}

function emit_raw_json_error(int $statusCode, string $code, string $message): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Request-ID: ' . request_id());
    echo json_encode([
        'success' => false,
        'ok' => false,
        'requestId' => request_id(),
        'error' => [
            'code' => $code,
            'message' => $message,
        ],
        'errorCode' => $code,
        'errorMessage' => $message,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

set_exception_handler(function (Throwable $e): void {
    emit_raw_json_error(500, 'INTERNAL_ERROR', 'Something went wrong');
});

set_error_handler(function (int $severity, string $message, string $file, int $line): bool {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$config = require __DIR__ . '/config.php';

// ── Security Headers ──────────────────────────────────────

function send_security_headers(): void
{
    header("X-Content-Type-Options: nosniff");
    header("X-Frame-Options: DENY");
    header("X-XSS-Protection: 1; mode=block");
    header("Referrer-Policy: strict-origin-when-cross-origin");
    header("Cross-Origin-Opener-Policy: same-origin-allow-popups");
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'");
    header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
}

// ── CORS ──────────────────────────────────────────────────

function send_cors_headers(): void
{
    global $config;
    $allowedOrigins = $config['cors_origins'] ?? ['http://localhost:5173'];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, $allowedOrigins, true)) {
        header("Access-Control-Allow-Origin: {$origin}");
    } elseif (($config['app_env'] ?? 'development') === 'development') {
        if (preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/', $origin)) {
            header("Access-Control-Allow-Origin: {$origin}");
        }
    }

    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token, X-Requested-With');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
}

// ── Response ──────────────────────────────────────────────

function send_json(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Request-ID: ' . request_id());
    send_security_headers();
    send_cors_headers();

    $success = array_key_exists('success', $payload)
        ? (bool) $payload['success']
        : (array_key_exists('ok', $payload) ? (bool) $payload['ok'] : $statusCode < 400);

    $response = [
        'success' => $success,
        'ok' => $success,
        'requestId' => request_id(),
    ];

    $reserved = [
        'success' => true,
        'ok' => true,
        'data' => true,
        'error' => true,
        'errorCode' => true,
        'errorDetails' => true,
        'pagination' => true,
        'meta' => true,
    ];

    $extras = [];
    foreach ($payload as $key => $value) {
        if (!isset($reserved[$key])) {
            $extras[$key] = $value;
        }
    }

    if ($success) {
        $response['data'] = array_key_exists('data', $payload) ? $payload['data'] : $extras;

        if (isset($payload['pagination'])) {
            $response['pagination'] = $payload['pagination'];
            $response['meta'] = array_merge((array) ($payload['meta'] ?? []), [
                'pagination' => $payload['pagination'],
            ]);
        } elseif (isset($payload['meta'])) {
            $response['meta'] = $payload['meta'];
        }
    } else {
        $code = (string) ($payload['errorCode'] ?? match (true) {
            $statusCode === 400 => 'BAD_REQUEST',
            $statusCode === 401 => 'UNAUTHORIZED',
            $statusCode === 403 => 'FORBIDDEN',
            $statusCode === 404 => 'NOT_FOUND',
            $statusCode === 409 => 'CONFLICT',
            $statusCode === 422 => 'VALIDATION_ERROR',
            $statusCode === 429 => 'RATE_LIMITED',
            $statusCode >= 500 => 'INTERNAL_ERROR',
            default => 'REQUEST_FAILED',
        });

        $message = 'Something went wrong';
        $details = $payload['errorDetails'] ?? null;

        if (array_key_exists('error', $payload)) {
            if (is_string($payload['error'])) {
                $message = $payload['error'];
            } elseif (is_array($payload['error'])) {
                $err = $payload['error'];
                if (isset($err['code'])) {
                    $code = (string) $err['code'];
                }
                if (isset($err['message']) && is_string($err['message'])) {
                    $message = $err['message'];
                }
                if (array_key_exists('details', $err)) {
                    $details = $err['details'];
                }
            }
        }

        $response['error'] = [
            'code' => $code,
            'message' => $message,
        ];
        if ($details !== null) {
            $response['error']['details'] = $details;
            $response['errorDetails'] = $details;
        }

        // Backward-compatible fields consumed by current frontend code.
        $response['errorCode'] = $code;
        $response['errorMessage'] = $message;
    }

    if (!empty($extras)) {
        $response = array_merge($response, $extras);
    }

    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function handle_preflight(): void
{
    send_security_headers();
    send_cors_headers();
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
}

// ── Input ─────────────────────────────────────────────────

function get_json_body(): array
{
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: '{}', true);
    return is_array($payload) ? $payload : [];
}

function get_bearer_token(): ?string
{
    $headers = [];
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
    } else {
        foreach ($_SERVER as $name => $value) {
            if (stripos($name, 'HTTP_') === 0) {
                $headers[str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))))] = $value;
            }
        }
    }

    // 1. Check Authorization header first (API clients, mobile apps)
    if (!empty($headers['Authorization'])) {
        if (preg_match('/Bearer\s+(\S+)/i', trim($headers['Authorization']), $m)) {
            return $m[1];
        }
    }

    // 2. Fall back to HttpOnly cookie (browser sessions)
    if (!empty($_COOKIE[AUTH_COOKIE_NAME])) {
        return $_COOKIE[AUTH_COOKIE_NAME];
    }

    return null;
}

function get_request_id(): int
{
    if (isset($_GET['id']) && is_numeric($_GET['id'])) {
        $id = (int) $_GET['id'];
    } else {
        $payload = get_json_body();
        $id = isset($payload['id']) && is_numeric($payload['id']) ? (int) $payload['id'] : 0;
    }

    if ($id <= 0) {
        send_json(422, ['ok' => false, 'error' => 'ID is required and must be a positive integer']);
    }
    return $id;
}

function get_client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// ── Key conversion ────────────────────────────────────────

function snake_to_camel(string $str): string
{
    return lcfirst(str_replace('_', '', ucwords($str, '_')));
}

function map_row(array $row): array
{
    $mapped = [];
    foreach ($row as $key => $value) {
        $mapped[snake_to_camel($key)] = $value;
    }
    return $mapped;
}

// ── JSON / type helpers ───────────────────────────────────

function decode_json_field($value, array $default = []): array
{
    if (is_array($value)) return $value;
    if ($value === null || $value === '') return $default;
    $decoded = json_decode((string) $value, true);
    return is_array($decoded) ? $decoded : $default;
}

function cast_types(array $row, array $intKeys = [], array $floatKeys = [], array $boolKeys = [], array $jsonKeys = []): array
{
    foreach ($intKeys as $k) {
        if (array_key_exists($k, $row)) {
            $row[$k] = $row[$k] !== null && $row[$k] !== '' ? (int) $row[$k] : null;
        }
    }
    foreach ($floatKeys as $k) {
        if (array_key_exists($k, $row)) {
            $row[$k] = $row[$k] !== null && $row[$k] !== '' ? (float) $row[$k] : null;
        }
    }
    foreach ($boolKeys as $k) {
        if (array_key_exists($k, $row)) {
            $row[$k] = (bool) $row[$k];
        }
    }
    foreach ($jsonKeys as $k) {
        if (array_key_exists($k, $row)) {
            $row[$k] = decode_json_field($row[$k]);
        }
    }
    return $row;
}

// ── Rate Limiting ─────────────────────────────────────────

function check_rate_limit(mysqli $mysqli, string $action, ?string $identifier = null, ?int $maxAttempts = null, ?int $windowSeconds = null): void
{
    return;
}

// ── Session / Token Management (hashed, multi-device) ─────

function create_session(mysqli $mysqli, int $userId, ?int $lifetimeHours = null, ?int $maxSessions = null): string
{
    global $config;
    $lifetimeHours = $lifetimeHours ?? ($config['session_lifetime_hours'] ?? 168);
    $maxSessions   = $maxSessions   ?? ($config['session_max_per_user'] ?? 5);

    $token     = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $expiresAt = date('Y-m-d H:i:s', time() + $lifetimeHours * 3600);
    $deviceInfo = substr($_SERVER['HTTP_USER_AGENT'] ?? 'unknown', 0, 255);
    $ip = get_client_ip();

    // Clean expired sessions for this user
    $clean = $mysqli->prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()');
    $clean->bind_param('i', $userId);
    $clean->execute();

    // Enforce max sessions per user (remove oldest)
    $countStmt = $mysqli->prepare('SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = ?');
    $countStmt->bind_param('i', $userId);
    $countStmt->execute();
    $count = (int) $countStmt->get_result()->fetch_assoc()['cnt'];

    if ($count >= $maxSessions) {
        $delOld = $mysqli->prepare(
            'DELETE FROM sessions WHERE user_id = ? ORDER BY last_used_at ASC LIMIT 1'
        );
        $delOld->bind_param('i', $userId);
        $delOld->execute();
    }

    // Insert new session
    $ins = $mysqli->prepare(
        'INSERT INTO sessions (user_id, token_hash, device_info, ip_address, expires_at) VALUES (?, ?, ?, ?, ?)'
    );
    $ins->bind_param('issss', $userId, $tokenHash, $deviceInfo, $ip, $expiresAt);
    $ins->execute();

    return $token;
}

function validate_session(mysqli $mysqli, string $token): ?array
{
    $tokenHash = hash('sha256', $token);

    $stmt = $mysqli->prepare(
        'SELECT s.id AS session_id, s.user_id, s.expires_at, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.deleted_at IS NULL
         LIMIT 1'
    );
    $stmt->bind_param('s', $tokenHash);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row) return null;

    // Update last_used_at
    $upd = $mysqli->prepare('UPDATE sessions SET last_used_at = NOW() WHERE id = ?');
    $upd->bind_param('i', $row['session_id']);
    $upd->execute();

    return $row;
}

function destroy_session(mysqli $mysqli, string $token): void
{
    $tokenHash = hash('sha256', $token);
    $stmt = $mysqli->prepare('DELETE FROM sessions WHERE token_hash = ?');
    $stmt->bind_param('s', $tokenHash);
    $stmt->execute();
}

function destroy_all_sessions(mysqli $mysqli, int $userId): void
{
    $stmt = $mysqli->prepare('DELETE FROM sessions WHERE user_id = ?');
    $stmt->bind_param('i', $userId);
    $stmt->execute();
}

function rotate_session(mysqli $mysqli, string $oldToken, int $userId): string
{
    destroy_session($mysqli, $oldToken);
    return create_session($mysqli, $userId);
}

// ── Secure session cookie helpers ─────────────────────────

define('AUTH_COOKIE_NAME', 'estateflow_token');

function set_auth_cookie(string $token, int $lifetimeHours = 0): void
{
    global $config;
    $lifetimeHours = $lifetimeHours ?: ($config['session_lifetime_hours'] ?? 168);
    $isProduction  = ($config['app_env'] ?? 'development') === 'production';
    $appUrl        = $config['app_url'] ?? '';

    // Derive cookie path from APP_URL (e.g. "/Activities/real_estate")
    $parsed = parse_url($appUrl);
    $basePath = rtrim($parsed['path'] ?? '/', '/');
    $cookiePath = $basePath ?: '/';

    setcookie(AUTH_COOKIE_NAME, $token, [
        'expires'  => time() + ($lifetimeHours * 3600),
        'path'     => $cookiePath,
        'domain'   => '',
        'secure'   => $isProduction,
        'httponly'  => true,
        'samesite'  => 'Lax',
    ]);
}

function clear_auth_cookie(): void
{
    global $config;
    $appUrl = $config['app_url'] ?? '';
    $parsed = parse_url($appUrl);
    $basePath = rtrim($parsed['path'] ?? '/', '/');
    $cookiePath = $basePath ?: '/';

    setcookie(AUTH_COOKIE_NAME, '', [
        'expires'  => time() - 3600,
        'path'     => $cookiePath,
        'domain'   => '',
        'secure'   => ($config['app_env'] ?? 'development') === 'production',
        'httponly'  => true,
        'samesite'  => 'Lax',
    ]);
}

// ── Auth middleware ────────────────────────────────────────

function require_auth(mysqli $mysqli): array
{
    $token = get_bearer_token();
    if (!$token) {
        send_json(401, ['ok' => false, 'error' => 'Missing authorization token']);
    }

    $user = validate_session($mysqli, $token);
    if (!$user) {
        send_json(401, ['ok' => false, 'error' => 'Invalid or expired token']);
    }

    return $user;
}

function optional_auth(mysqli $mysqli): ?array
{
    $token = get_bearer_token();
    if (!$token) return null;
    return validate_session($mysqli, $token);
}

function require_role(array $user, array $allowedRoles): void
{
    if (!in_array($user['user_type'], $allowedRoles, true)) {
        send_json(403, ['ok' => false, 'error' => 'Insufficient permissions']);
    }
}

// ── Audit logging ─────────────────────────────────────────

function audit_log(mysqli $mysqli, ?int $userId, string $action, string $resourceType, ?int $resourceId = null, ?string $details = null): void
{
    $ip = get_client_ip();
    $stmt = $mysqli->prepare(
        'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param('ississ', $userId, $action, $resourceType, $resourceId, $details, $ip);
    $stmt->execute();
}

// ── Notifications ─────────────────────────────────────────

function create_notification(
    mysqli $mysqli,
    int $userId,
    string $type,
    string $title,
    string $message,
    ?string $referenceType = null,
    ?int $referenceId = null
): void {
    $stmt = $mysqli->prepare(
        'INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param('issssi', $userId, $type, $title, $message, $referenceType, $referenceId);
    $stmt->execute();
}

function cache_google_avatar(string $url): ?string
{
    $url = trim($url);
    if ($url === '') {
        return null;
    }

    $parts = parse_url($url);
    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($host === '' || !preg_match('/(^|\.)((googleusercontent\.com)|(gstatic\.com)|(google\.com))$/i', $host)) {
        return null;
    }

    $body = false;
    $mime = '';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_FAILONERROR, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'EstateFlow/1.0');
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $mime = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);

        if ($body === false || $status < 200 || $status >= 300) {
            return null;
        }
    } else {
        $context = stream_context_create(['http' => ['timeout' => 10, 'follow_location' => 1, 'user_agent' => 'EstateFlow/1.0']]);
        $body = @file_get_contents($url, false, $context);
        if ($body === false) {
            return null;
        }
    }

    if (!is_string($body) || $body === '') {
        return null;
    }

    if ($mime === '') {
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = (string) $finfo->buffer($body);
    }

    $allowedMimes = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
    ];
    $mime = strtolower(trim(strtok($mime, ';') ?: $mime));
    if (!isset($allowedMimes[$mime])) {
        return null;
    }

    $uploadDir = $config['upload_dir'] ?? (__DIR__ . '/../storage/uploads');
    if (!str_starts_with($uploadDir, '/') && !preg_match('/^[A-Z]:\\\\/i', $uploadDir)) {
        $uploadDir = __DIR__ . '/' . $uploadDir;
    }
    $uploadDir = realpath($uploadDir) ?: $uploadDir;
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0750, true)) {
        return null;
    }

    $filename = 'google-avatar-' . bin2hex(random_bytes(12)) . '.' . $allowedMimes[$mime];
    $destPath = $uploadDir . '/' . $filename;
    if (file_put_contents($destPath, $body) === false) {
        return null;
    }
    chmod($destPath, 0640);

    $publicDir = __DIR__ . '/../public/images/uploads';
    if (!is_dir($publicDir)) {
        mkdir($publicDir, 0755, true);
    }
    $publicPath = $publicDir . '/' . $filename;
    $destReal = realpath($destPath) ?: $destPath;
    $publicReal = realpath($publicPath) ?: $publicPath;
    if ($destReal !== $publicReal) {
        if (!@copy($destPath, $publicPath)) {
            error_log('helpers.php: failed to copy cached avatar to public path: ' . $publicPath);
        }
    }

    return '/public/images/uploads/' . $filename;
}

// ── Soft Delete helpers ───────────────────────────────────

function soft_delete(mysqli $mysqli, string $table, int $id): void
{
    $allowed = ['users', 'properties', 'inquiries', 'appointments', 'reservations'];
    if (!in_array($table, $allowed, true)) {
        send_json(400, ['ok' => false, 'error' => 'Invalid table']);
    }

    $stmt = $mysqli->prepare("SELECT id FROM {$table} WHERE id = ? AND deleted_at IS NULL LIMIT 1");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    if (!$stmt->get_result()->fetch_assoc()) {
        send_json(404, ['ok' => false, 'error' => ucfirst($table) . ' not found']);
    }

    $now = date('Y-m-d H:i:s');
    $stmt = $mysqli->prepare("UPDATE {$table} SET deleted_at = ? WHERE id = ? LIMIT 1");
    $stmt->bind_param('si', $now, $id);
    $stmt->execute();
}

function delete_by_id(mysqli $mysqli, string $table, int $id): int
{
    $allowed = ['favorites', 'neighborhoods', 'testimonials', 'market_insights', 'audit_logs', 'notifications', 'disputes', 'rate_limits'];
    if (!in_array($table, $allowed, true)) {
        send_json(400, ['ok' => false, 'error' => 'Invalid table']);
    }

    $stmt = $mysqli->prepare("SELECT id FROM {$table} WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    if (!$stmt->get_result()->fetch_assoc()) {
        send_json(404, ['ok' => false, 'error' => ucfirst($table) . ' not found']);
    }

    $stmt = $mysqli->prepare("DELETE FROM {$table} WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $id);
    $stmt->execute();

    if ($stmt->affected_rows === 0) {
        send_json(500, ['ok' => false, 'error' => 'Failed to delete ' . $table]);
    }
    return $id;
}

// ── Pagination ────────────────────────────────────────────

function get_pagination_params(int $defaultLimit = 20, int $maxLimit = 100): array
{
    $page  = max(1, (int) ($_GET['page'] ?? 1));
    $limit = min($maxLimit, max(1, (int) ($_GET['per_page'] ?? $_GET['limit'] ?? $defaultLimit)));
    $offset = ($page - 1) * $limit;
    return ['page' => $page, 'limit' => $limit, 'offset' => $offset];
}

function paginated_response(array $rows, int $total, int $page, int $limit): array
{
    return [
        'ok'   => true,
        'data' => $rows,
        'pagination' => [
            'total'      => $total,
            'page'       => $page,
            'perPage'    => $limit,
            'totalPages' => (int) ceil($total / max(1, $limit)),
        ],
    ];
}

// ── Duplicate / Fraud detection ───────────────────────────

function check_duplicate_user(mysqli $mysqli, string $email, ?string $phone = null, ?int $excludeId = null): void
{
    $sql = 'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL';
    $params = [$email];
    $types = 's';

    if ($excludeId) {
        $sql .= ' AND id <> ?';
        $params[] = $excludeId;
        $types .= 'i';
    }

    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    if ($stmt->get_result()->fetch_assoc()) {
        send_json(409, ['ok' => false, 'error' => 'Email already registered']);
    }

    if ($phone !== null && $phone !== '') {
        $sql2 = 'SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL';
        $params2 = [$phone];
        $types2 = 's';
        if ($excludeId) {
            $sql2 .= ' AND id <> ?';
            $params2[] = $excludeId;
            $types2 .= 'i';
        }
        $stmt2 = $mysqli->prepare($sql2);
        $stmt2->bind_param($types2, ...$params2);
        $stmt2->execute();
        if ($stmt2->get_result()->fetch_assoc()) {
            send_json(409, ['ok' => false, 'error' => 'Phone number already registered']);
        }
    }
}

// ── Input sanitization ────────────────────────────────────

function sanitize_string(string $input, int $maxLength = 255): string
{
    $input = trim($input);
    $input = strip_tags($input);
    if (strlen($input) > $maxLength) {
        $input = substr($input, 0, $maxLength);
    }
    return $input;
}

/** Escape LIKE wildcard characters (% and _) in user input. */
function escape_like(string $input): string
{
    return str_replace(['%', '_'], ['\%', '\_'], $input);
}

function validate_email(string $email): string
{
    $email = strtolower(trim($email));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid email format']);
    }
    return $email;
}

function validate_phone(string $phone): string
{
    $phone = trim($phone);
    if (!preg_match('/^\+?[0-9]{10,15}$/', $phone)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid phone number format']);
    }
    return $phone;
}

// ── Password hashing with configurable cost ───────────────

function hash_password(string $password): string
{
    global $config;
    $cost = $config['bcrypt_cost'] ?? 12;
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => $cost]);
}

// ── Reservation lock ──────────────────────────────────────

/**
 * Return the active reservation row for a property, or null if none.
 */
function property_visible_statuses(): array
{
    return ['available', 'reserved', 'under_offer', 'sold'];
}

function expire_stale_reservations_and_release_properties(mysqli $mysqli): void
{
    $mysqli->query(
        "UPDATE reservations
         SET status = 'expired'
         WHERE status IN ('pending', 'active')
           AND expires_at < NOW()
           AND deleted_at IS NULL"
    );

    $mysqli->query(
        "UPDATE properties p
         LEFT JOIN reservations r
           ON r.property_id = p.id
          AND r.status IN ('pending', 'active')
          AND r.deleted_at IS NULL
         LEFT JOIN offers o
           ON o.property_id = p.id
          AND o.status = 'accepted'
          AND o.deleted_at IS NULL
         SET p.status = 'available'
         WHERE p.deleted_at IS NULL
           AND p.status = 'reserved'
           AND r.id IS NULL
           AND o.id IS NULL"
    );
}

function set_property_status(mysqli $mysqli, int $propertyId, string $status): void
{
    $stmt = $mysqli->prepare('UPDATE properties SET status = ? WHERE id = ? AND deleted_at IS NULL');
    $stmt->bind_param('si', $status, $propertyId);
    $stmt->execute();
}

function get_current_reservation(mysqli $mysqli, int $propertyId): ?array
{
    expire_stale_reservations_and_release_properties($mysqli);

    $stmt = $mysqli->prepare(
        "SELECT r.id,
                r.user_id,
                r.status,
                r.expires_at,
                r.notes,
                r.payment_intent,
                r.calculator_snapshot,
                r.created_at,
                r.updated_at,
                CONCAT(u.first_name, ' ', u.last_name) AS user_name,
                p.owner_id,
                CONCAT(o.first_name, ' ', o.last_name) AS owner_name
         FROM reservations r
         JOIN users u ON u.id = r.user_id
         JOIN properties p ON p.id = r.property_id
         JOIN users o ON o.id = p.owner_id
         WHERE r.property_id = ?
           AND r.status IN ('pending', 'active')
           AND r.deleted_at IS NULL
         ORDER BY CASE r.status WHEN 'active' THEN 0 ELSE 1 END, r.created_at DESC
         LIMIT 1"
    );
    $stmt->bind_param('i', $propertyId);
    $stmt->execute();
    return $stmt->get_result()->fetch_assoc() ?: null;
}

function get_active_reservation(mysqli $mysqli, int $propertyId): ?array
{
    $reservation = get_current_reservation($mysqli, $propertyId);
    if (!$reservation || (string) $reservation['status'] !== 'active') {
        return null;
    }
    return $reservation;
}

function get_buyer_reservation(mysqli $mysqli, int $propertyId, int $userId, array $statuses = ['pending', 'active']): ?array
{
    expire_stale_reservations_and_release_properties($mysqli);

    if (!$statuses) {
        return null;
    }

    $placeholders = implode(',', array_fill(0, count($statuses), '?'));
    $types = 'ii' . str_repeat('s', count($statuses));
    $params = [$propertyId, $userId, ...$statuses];

    $stmt = $mysqli->prepare(
        "SELECT *
         FROM reservations
         WHERE property_id = ?
           AND user_id = ?
           AND status IN ({$placeholders})
           AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1"
    );
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    return $stmt->get_result()->fetch_assoc() ?: null;
}

function sync_property_status(mysqli $mysqli, int $propertyId): void
{
    $stmt = $mysqli->prepare('SELECT status FROM properties WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $propertyId);
    $stmt->execute();
    $property = $stmt->get_result()->fetch_assoc();
    if (!$property) {
        return;
    }

    $currentStatus = (string) $property['status'];
    if (in_array($currentStatus, ['draft', 'pending_approval', 'sold'], true)) {
        return;
    }

    expire_stale_reservations_and_release_properties($mysqli);

    $acceptedOfferStmt = $mysqli->prepare(
        "SELECT id
         FROM offers
         WHERE property_id = ?
           AND status = 'accepted'
           AND deleted_at IS NULL
         LIMIT 1"
    );
    $acceptedOfferStmt->bind_param('i', $propertyId);
    $acceptedOfferStmt->execute();
    if ($acceptedOfferStmt->get_result()->fetch_assoc()) {
        if ($currentStatus !== 'under_offer') {
            set_property_status($mysqli, $propertyId, 'under_offer');
        }
        return;
    }

    $reservation = get_current_reservation($mysqli, $propertyId);
    if ($reservation) {
        if ($currentStatus !== 'reserved') {
            set_property_status($mysqli, $propertyId, 'reserved');
        }
        return;
    }

    if ($currentStatus !== 'available') {
        set_property_status($mysqli, $propertyId, 'available');
    }
}

function has_completed_viewing(mysqli $mysqli, int $propertyId, int $userId): bool
{
    $stmt = $mysqli->prepare(
        "SELECT id
         FROM appointments
         WHERE property_id = ?
           AND user_id = ?
           AND appointment_type = 'viewing'
           AND status = 'completed'
           AND deleted_at IS NULL
         LIMIT 1"
    );
    $stmt->bind_param('ii', $propertyId, $userId);
    $stmt->execute();
    return (bool) $stmt->get_result()->fetch_assoc();
}

function calculate_monthly_amortization(float $loanAmount, float $annualInterestRate, int $totalMonths): float
{
    if ($loanAmount <= 0 || $annualInterestRate <= 0 || $totalMonths <= 0) {
        return 0.0;
    }

    $monthlyRate = $annualInterestRate / 100 / 12;
    $factor = pow(1 + $monthlyRate, $totalMonths);
    if ($factor <= 1) {
        return 0.0;
    }

    return $loanAmount * (($monthlyRate * $factor) / ($factor - 1));
}

function validate_calculator_snapshot(array $snapshot, int $propertyPrice, float $interestRate): array
{
    $price = (int) round((float) ($snapshot['price'] ?? 0));
    $downPaymentPercentage = (float) ($snapshot['downPaymentPercentage'] ?? 0);
    $loanTermYears = (int) ($snapshot['loanTermYears'] ?? 0);
    $snapshotInterestRate = (float) ($snapshot['interestRate'] ?? 0);
    $downPaymentAmount = (int) round((float) ($snapshot['downPaymentAmount'] ?? 0));
    $loanAmount = (int) round((float) ($snapshot['loanAmount'] ?? 0));
    $monthlyPayment = (int) round((float) ($snapshot['monthlyPayment'] ?? 0));

    if ($price !== $propertyPrice) {
        send_json(422, ['ok' => false, 'error' => 'Calculator price must match the property price']);
    }
    if ($downPaymentPercentage <= 0 || $downPaymentPercentage >= 100) {
        send_json(422, ['ok' => false, 'error' => 'Down payment percentage must be between 0 and 100']);
    }
    if ($loanTermYears <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Loan term is required']);
    }
    if (abs($snapshotInterestRate - $interestRate) > 0.01) {
        send_json(422, ['ok' => false, 'error' => 'Calculator interest rate is out of date. Please recalculate using the latest property terms.']);
    }

    $expectedDownPayment = (int) round($propertyPrice * ($downPaymentPercentage / 100));
    $expectedLoanAmount = $propertyPrice - $expectedDownPayment;
    $expectedMonthlyPayment = (int) round(
        calculate_monthly_amortization((float) $expectedLoanAmount, $interestRate, $loanTermYears * 12)
    );

    if ($downPaymentAmount !== $expectedDownPayment || $loanAmount !== $expectedLoanAmount || $monthlyPayment !== $expectedMonthlyPayment) {
        send_json(422, ['ok' => false, 'error' => 'Down payment calculation is invalid. Please review the calculator before continuing.']);
    }

    return [
        'price' => $price,
        'downPaymentPercentage' => $downPaymentPercentage,
        'loanTermYears' => $loanTermYears,
        'interestRate' => $interestRate,
        'downPaymentAmount' => $expectedDownPayment,
        'loanAmount' => $expectedLoanAmount,
        'monthlyPayment' => $expectedMonthlyPayment,
    ];
}

/**
 * Block the request if the property is reserved by someone other than $userId.
 * Call this in POST handlers for payments, inquiries, appointments, etc.
 */
function check_reservation_lock(mysqli $mysqli, int $propertyId, int $userId): void
{
    $reservation = get_current_reservation($mysqli, $propertyId);
    if ($reservation && (int) $reservation['user_id'] !== $userId) {
        send_json(409, [
            'ok' => false,
            'error' => 'This property already has an active reservation flow for another buyer.',
        ]);
    }
}

// ── Property response builder ─────────────────────────────

function build_property_row(array $row): array
{
    $coords = null;
    if (($row['latitude'] ?? null) !== null && ($row['longitude'] ?? null) !== null) {
        $coords = ['lat' => (float) $row['latitude'], 'lng' => (float) $row['longitude']];
    }

    return [
        'id'           => (int) $row['id'],
        'title'        => (string) $row['title'],
        'address'      => (string) $row['address'],
        'city'         => (string) $row['city'],
        'province'     => (string) $row['province'],
        'zipCode'      => (string) ($row['zip_code'] ?? ''),
        'price'        => (int) $row['price'],
        'beds'         => (int) $row['beds'],
        'baths'        => (int) $row['baths'],
        'sqft'         => (int) $row['sqft'],
        'sqm'          => (int) $row['sqm'],
        'propertyType' => (string) $row['property_type'],
        'status'       => (string) $row['status'],
        'image'        => (string) $row['image'],
        'images'       => decode_json_field($row['images'] ?? null),
        'description'  => (string) $row['description'],
        'amenities'    => decode_json_field($row['amenities'] ?? null),
        'yearBuilt'    => ($row['year_built'] ?? null) !== null ? (int) $row['year_built'] : null,
        'lotSize'      => ($row['lot_size'] ?? null) !== null ? (int) $row['lot_size'] : null,
        'garage'       => (int) ($row['garage'] ?? 0),
        'pool'         => (bool) ($row['pool'] ?? false),
        'furnished'    => (bool) ($row['furnished'] ?? false),
        'ownerId'      => (int) $row['owner_id'],
        'ownerName'    => isset($row['owner_name']) ? (string) $row['owner_name'] : '',
        'interestRate' => isset($row['interest_rate']) ? (float) $row['interest_rate'] : 6.5,
        'proofDocument' => $row['proof_document'] ?? null,
        'reservationFee' => isset($row['reservation_fee']) ? (int) $row['reservation_fee'] : null,
        'coordinates'  => $coords,
        'createdAt'    => (string) ($row['created_at'] ?? ''),
        'updatedAt'    => (string) ($row['updated_at'] ?? ''),
    ];
}

// ── User response builder ─────────────────────────────────

function build_user_row(array $row): array
{
    $phone = (string) $row['phone'];
    $isGoogleUser = str_starts_with($phone, 'google-');
    return [
        'id'        => (int) $row['id'],
        'firstName' => (string) $row['first_name'],
        'lastName'  => (string) $row['last_name'],
        'email'     => (string) $row['email'],
        'phone'     => $isGoogleUser ? '' : $phone,
        'role'      => (string) $row['user_type'],
        'userType'  => (string) $row['user_type'],
        'avatar'    => $row['avatar'] ?? null,
        'bio'       => $row['bio'] ?? null,
        'isGoogleUser' => $isGoogleUser,
        'verificationStatus' => (string) ($row['verification_status'] ?? 'unverified'),
        'verificationDocument' => $row['verification_document'] ?? null,
        'verificationDocumentType' => $row['verification_document_type'] ?? null,
        'verificationExpiresAt' => $row['verification_expires_at'] ?? null,
        'idType'    => $row['id_type'] ?? null,
        'verificationNotes' => $row['verification_notes'] ?? null,
        'verifiedAt' => $row['verified_at'] ?? null,
        'verifiedBy' => ($row['verified_by'] ?? null) ? (int) $row['verified_by'] : null,
        'verifiedByName' => $row['verified_by_name'] ?? null,
        'emailVerifiedAt' => $row['email_verified_at'] ?? null,
        'status'    => ($row['deleted_at'] ?? null) ? 'deleted' : (($row['created_at'] ?? null) ? 'active' : 'inactive'),
        'createdAt' => (string) ($row['created_at'] ?? ''),
        'updatedAt' => (string) ($row['updated_at'] ?? ''),
    ];
}
