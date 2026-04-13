<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

require_once __DIR__ . '/db.php';

$payload = get_json_body();
$action  = trim((string) ($payload['action'] ?? ''));

// ── Helpers ──────────────────────────────────────────────

function authUserResponse(array $row): array
{
    return [
        'id'                 => (int) $row['id'],
        'firstName'          => (string) $row['first_name'],
        'lastName'           => (string) $row['last_name'],
        'email'              => (string) $row['email'],
        'phone'              => (string) $row['phone'],
        'role'               => (string) $row['user_type'],
        'avatar'             => $row['avatar'] ?? null,
        'emailVerifiedAt'    => $row['email_verified_at'] ?? null,
        'verificationStatus' => (string) ($row['verification_status'] ?? 'unverified'),
    ];
}

function fetchGoogleTokenInfo(string $idToken): ?array
{
    global $config;
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_FAILONERROR, false);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErr = curl_error($ch);
        curl_close($ch);

        if ($response === false && ($config['app_env'] ?? 'development') === 'development') {
            // Local Windows setups can fail CA verification; allow fallback in dev only.
            $ch2 = curl_init($url);
            curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch2, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch2, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch2, CURLOPT_SSL_VERIFYHOST, 0);
            $response = curl_exec($ch2);
            $status = (int) curl_getinfo($ch2, CURLINFO_HTTP_CODE);
            curl_close($ch2);
        }

        if ($response === false) {
            return ['_error' => $curlErr !== '' ? $curlErr : 'Google token verification request failed'];
        }

        $decoded = json_decode($response, true);
        if (!is_array($decoded)) {
            return ['_error' => 'Invalid response from Google token verification endpoint'];
        }

        if ($status !== 200) {
            $googleError = (string) ($decoded['error_description'] ?? $decoded['error'] ?? 'Unable to verify Google token');
            return ['_error' => $googleError];
        }

        return $decoded;
    }

    $context = stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]);
    $response = @file_get_contents($url, false, $context);
    if ($response === false) {
        return ['_error' => 'Google token verification request failed'];
    }

    $decoded = json_decode($response, true);
    return is_array($decoded) ? $decoded : ['_error' => 'Invalid response from Google token verification endpoint'];
}

// ── Register ─────────────────────────────────────────────

if ($action === 'register') {
    check_rate_limit($mysqli, 'register');

    $firstName = sanitize_string((string) ($payload['firstName'] ?? ''), 120);
    $lastName  = sanitize_string((string) ($payload['lastName']  ?? ''), 120);
    $email     = validate_email((string) ($payload['email'] ?? ''));
    $phone     = validate_phone((string) ($payload['phone'] ?? ''));
    $password  = (string) ($payload['password'] ?? '');
    $role      = trim((string) ($payload['role']      ?? ''));

    $publicRoles = ['agent', 'seller', 'buyer', 'clerk'];

    if ($firstName === '' || $lastName === '' || $password === '' || $role === '') {
        send_json(422, ['ok' => false, 'error' => 'All fields are required']);
    }
    if (strlen($password) < 8) {
        send_json(422, ['ok' => false, 'error' => 'Password must be at least 8 characters']);
    }
    if (strlen($password) > 72) {
        send_json(422, ['ok' => false, 'error' => 'Password must not exceed 72 characters']);
    }
    if (!in_array($role, $publicRoles, true)) {
        send_json(403, ['ok' => false, 'error' => 'Cannot register as this role']);
    }

    // Duplicate check (email + phone)
    check_duplicate_user($mysqli, $email, $phone);

    $hash = hash_password($password);
    $ins  = $mysqli->prepare(
        'INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $ins->bind_param('ssssss', $firstName, $lastName, $email, $phone, $hash, $role);
    $ins->execute();

    $userId = (int) $mysqli->insert_id;

    $token = create_session($mysqli, $userId);

    $sel = $mysqli->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $sel->bind_param('i', $userId);
    $sel->execute();
    $user = $sel->get_result()->fetch_assoc();

    audit_log($mysqli, $userId, 'REGISTER', 'user', $userId, "New {$role} account: {$email}");

    set_auth_cookie($token);
    send_json(200, ['ok' => true, 'data' => ['token' => $token, 'user' => authUserResponse($user)]]);
}

// ── Login ────────────────────────────────────────────────

if ($action === 'login') {
    check_rate_limit($mysqli, 'login');

    $email    = strtolower(trim((string) ($payload['email'] ?? '')));
    $password = (string) ($payload['password'] ?? '');

    if ($email === '' || $password === '') {
        send_json(422, ['ok' => false, 'error' => 'Email and password are required']);
    }

    $stmt = $mysqli->prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if (!$user || !password_verify($password, (string) $user['password_hash'])) {
        send_json(401, ['ok' => false, 'error' => 'Invalid email or password']);
    }

    // Rehash if bcrypt cost has changed
    if (password_needs_rehash($user['password_hash'], PASSWORD_BCRYPT, ['cost' => $config['bcrypt_cost'] ?? 12])) {
        $newHash = hash_password($password);
        $rehash = $mysqli->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $rehash->bind_param('si', $newHash, $user['id']);
        $rehash->execute();
    }

    $token = create_session($mysqli, (int) $user['id']);
    audit_log($mysqli, (int) $user['id'], 'LOGIN', 'user', (int) $user['id'], "Login: {$email}");

    set_auth_cookie($token);
    send_json(200, ['ok' => true, 'data' => ['token' => $token, 'user' => authUserResponse($user)]]);
}

// ── Google Login ─────────────────────────────────────────

if ($action === 'google_login') {
    check_rate_limit($mysqli, 'google_login');

    $idToken = trim((string) ($payload['idToken'] ?? ''));
    if ($idToken === '') {
        send_json(422, ['ok' => false, 'error' => 'Google ID token is required']);
    }

    $googleClientId = trim((string) ($config['google_client_id'] ?? ''));
    if ($googleClientId === '') {
        send_json(500, ['ok' => false, 'error' => 'Google login is not configured on the server']);
    }

    $tokenInfo = fetchGoogleTokenInfo($idToken);
    if (!$tokenInfo || isset($tokenInfo['_error'])) {
        $err = (string) ($tokenInfo['_error'] ?? 'Unable to verify Google token');
        send_json(401, ['ok' => false, 'error' => $err]);
    }

    $aud = (string) ($tokenInfo['aud'] ?? '');
    if ($aud !== $googleClientId) {
        send_json(401, ['ok' => false, 'error' => 'Google token audience mismatch']);
    }

    $email = strtolower(trim((string) ($tokenInfo['email'] ?? '')));
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(422, ['ok' => false, 'error' => 'Google account email is missing or invalid']);
    }

    $emailVerifiedRaw = $tokenInfo['email_verified'] ?? false;
    $emailVerified = $emailVerifiedRaw === true || $emailVerifiedRaw === 'true' || $emailVerifiedRaw === '1' || $emailVerifiedRaw === 1;
    if (!$emailVerified) {
        send_json(401, ['ok' => false, 'error' => 'Google email is not verified']);
    }

    $fullName = trim((string) ($tokenInfo['name'] ?? 'Google User'));
    $nameParts = preg_split('/\s+/', $fullName) ?: [];
    $firstName = sanitize_string((string) ($nameParts[0] ?? 'Google'), 120);
    $lastName = sanitize_string((string) (count($nameParts) > 1 ? implode(' ', array_slice($nameParts, 1)) : 'User'), 120);
    $picture = trim((string) ($tokenInfo['picture'] ?? ''));
    $subject = trim((string) ($tokenInfo['sub'] ?? ''));

    $stmt = $mysqli->prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if (!$user) {
        // New user — create a signed pending token so the frontend can choose a role
        // without needing to re-verify the Google token (which may expire).
        $pendingData = json_encode([
            'email'     => $email,
            'firstName' => $firstName,
            'lastName'  => $lastName,
            'picture'   => $picture,
            'subject'   => $subject,
            'exp'       => time() + 300, // 5 min expiry
        ]);
        $secret = $config['app_secret'] ?? 'estateflow-fallback-secret';
        $sig = hash_hmac('sha256', $pendingData, $secret);
        $pendingToken = base64_encode($pendingData) . '.' . $sig;

        send_json(200, ['ok' => true, 'data' => [
            'needsRole'    => true,
            'email'        => $email,
            'name'         => $fullName,
            'pendingToken' => $pendingToken,
        ]]);
    }

    // Existing user — log in directly
    // Refresh avatar from Google when available to recover from stale/truncated URLs.
    if ($picture !== '' && (string) ($user['avatar'] ?? '') !== $picture) {
        $updAvatar = $mysqli->prepare('UPDATE users SET avatar = ? WHERE id = ?');
        $uid = (int) $user['id'];
        $updAvatar->bind_param('si', $picture, $uid);
        $updAvatar->execute();
        $user['avatar'] = $picture;
    }

    if (($user['email_verified_at'] ?? null) === null) {
        $updVerified = $mysqli->prepare('UPDATE users SET email_verified_at = NOW() WHERE id = ?');
        $uid = (int) $user['id'];
        $updVerified->bind_param('i', $uid);
        $updVerified->execute();
        $user['email_verified_at'] = date('Y-m-d H:i:s');
    }

    $token = create_session($mysqli, (int) $user['id']);
    audit_log($mysqli, (int) $user['id'], 'LOGIN_GOOGLE', 'user', (int) $user['id'], "Google login: {$email}");

    set_auth_cookie($token);
    send_json(200, ['ok' => true, 'data' => ['token' => $token, 'user' => authUserResponse($user)]]);
}

// ── Google Register (complete pending Google sign-up with role) ───

if ($action === 'google_register') {
    check_rate_limit($mysqli, 'google_login');

    $pendingToken = trim((string) ($payload['pendingToken'] ?? ''));
    $role = trim((string) ($payload['role'] ?? ''));
    $publicRoles = ['agent', 'seller', 'buyer', 'clerk'];

    if ($pendingToken === '' || $role === '') {
        send_json(422, ['ok' => false, 'error' => 'Pending token and role are required']);
    }
    if (!in_array($role, $publicRoles, true)) {
        send_json(403, ['ok' => false, 'error' => 'Invalid role']);
    }

    // Verify the signed pending token
    $parts = explode('.', $pendingToken, 2);
    if (count($parts) !== 2) {
        send_json(401, ['ok' => false, 'error' => 'Invalid pending token']);
    }
    $secret = $config['app_secret'] ?? 'estateflow-fallback-secret';
    $dataJson = base64_decode($parts[0], true);
    if ($dataJson === false) {
        send_json(401, ['ok' => false, 'error' => 'Invalid pending token']);
    }
    $expectedSig = hash_hmac('sha256', $dataJson, $secret);
    if (!hash_equals($expectedSig, $parts[1])) {
        send_json(401, ['ok' => false, 'error' => 'Invalid pending token signature']);
    }

    $data = json_decode($dataJson, true);
    if (!is_array($data) || ($data['exp'] ?? 0) < time()) {
        send_json(401, ['ok' => false, 'error' => 'Pending token has expired. Please try signing in with Google again.']);
    }

    $email     = strtolower(trim((string) ($data['email'] ?? '')));
    $firstName = (string) ($data['firstName'] ?? 'Google');
    $lastName  = (string) ($data['lastName'] ?? 'User');
    $picture   = (string) ($data['picture'] ?? '');
    $subject   = (string) ($data['subject'] ?? '');

    // Double-check user doesn't already exist (race condition guard)
    $stmt = $mysqli->prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();

    if ($existing) {
        // Already created between requests — just log in
        $user = $existing;
    } else {
        // Check for soft-deleted user with the same email — reactivate instead of inserting
        $stmtDel = $mysqli->prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NOT NULL LIMIT 1');
        $stmtDel->bind_param('s', $email);
        $stmtDel->execute();
        $softDeleted = $stmtDel->get_result()->fetch_assoc();

        if ($softDeleted) {
            // Reactivate soft-deleted account with fresh details
            $phone = 'google-' . substr($subject !== '' ? $subject : md5($email), 0, 20);
            $tempPassword = bin2hex(random_bytes(24));
            $hash = hash_password($tempPassword);
            $avatar = $picture !== '' ? $picture : null;

            $upd = $mysqli->prepare(
                'UPDATE users SET first_name = ?, last_name = ?, phone = ?, password_hash = ?,
                 user_type = ?, avatar = ?, email_verified_at = NOW(), deleted_at = NULL WHERE id = ?'
            );
            $uid = (int) $softDeleted['id'];
            $upd->bind_param('ssssssi', $firstName, $lastName, $phone, $hash, $role, $avatar, $uid);
            $upd->execute();

            $sel = $mysqli->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
            $sel->bind_param('i', $uid);
            $sel->execute();
            $user = $sel->get_result()->fetch_assoc();

            audit_log($mysqli, $uid, 'REACTIVATE_GOOGLE', 'user', $uid, "Reactivated via Google ({$role}): {$email}");
        } else {
            $phone = 'google-' . substr($subject !== '' ? $subject : md5($email), 0, 20);
            $tempPassword = bin2hex(random_bytes(24));
            $hash = hash_password($tempPassword);

            $ins = $mysqli->prepare(
                'INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type, avatar, email_verified_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())'
            );
            $avatar = $picture !== '' ? $picture : null;
            $ins->bind_param('sssssss', $firstName, $lastName, $email, $phone, $hash, $role, $avatar);
            $ins->execute();

            $userId = (int) $mysqli->insert_id;
            $sel = $mysqli->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
            $sel->bind_param('i', $userId);
            $sel->execute();
            $user = $sel->get_result()->fetch_assoc();

            audit_log($mysqli, $userId, 'REGISTER_GOOGLE', 'user', $userId, "Google sign-up ({$role}): {$email}");
        }
    }

    $token = create_session($mysqli, (int) $user['id']);
    audit_log($mysqli, (int) $user['id'], 'LOGIN_GOOGLE', 'user', (int) $user['id'], "Google login: {$email}");

    set_auth_cookie($token);
    send_json(200, ['ok' => true, 'data' => ['token' => $token, 'user' => authUserResponse($user)]]);
}

// ── Me ───────────────────────────────────────────────────

if ($action === 'me') {
    $token = get_bearer_token() ?? trim((string) ($payload['token'] ?? ''));
    if ($token === '') {
        send_json(401, ['ok' => false, 'error' => 'Missing token']);
    }

    $user = validate_session($mysqli, $token);
    if (!$user) {
        send_json(401, ['ok' => false, 'error' => 'Invalid or expired token']);
    }

    send_json(200, ['ok' => true, 'data' => ['user' => authUserResponse($user)]]);
}

// ── Refresh (token rotation) ─────────────────────────────

if ($action === 'refresh') {
    $token = get_bearer_token() ?? trim((string) ($payload['token'] ?? ''));
    if ($token === '') {
        send_json(401, ['ok' => false, 'error' => 'Missing token']);
    }

    $user = validate_session($mysqli, $token);
    if (!$user) {
        send_json(401, ['ok' => false, 'error' => 'Invalid or expired token']);
    }

    $newToken = rotate_session($mysqli, $token, (int) $user['id']);

    set_auth_cookie($newToken);
    send_json(200, ['ok' => true, 'data' => ['token' => $newToken, 'user' => authUserResponse($user)]]);
}

// ── Logout ───────────────────────────────────────────────

if ($action === 'logout') {
    $token = get_bearer_token() ?? trim((string) ($payload['token'] ?? ''));
    if ($token !== '') {
        destroy_session($mysqli, $token);
    }
    clear_auth_cookie();
    send_json(200, ['ok' => true, 'data' => ['loggedOut' => true]]);
}

// ── Logout All Devices ───────────────────────────────────

if ($action === 'logout_all') {
    $token = get_bearer_token() ?? trim((string) ($payload['token'] ?? ''));
    if ($token === '') {
        send_json(401, ['ok' => false, 'error' => 'Missing token']);
    }

    $user = validate_session($mysqli, $token);
    if (!$user) {
        send_json(401, ['ok' => false, 'error' => 'Invalid or expired token']);
    }

    destroy_all_sessions($mysqli, (int) $user['id']);
    audit_log($mysqli, (int) $user['id'], 'LOGOUT_ALL', 'user', (int) $user['id'], 'All sessions destroyed');

    clear_auth_cookie();
    send_json(200, ['ok' => true, 'data' => ['loggedOut' => true]]);
}

// ── Forgot Password (request reset) ──────────────────────

if ($action === 'forgot_password') {
    check_rate_limit($mysqli, 'password_reset', null, 3, 3600);

    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    if ($email === '') {
        send_json(422, ['ok' => false, 'error' => 'Email is required']);
    }

    // Always return success to prevent email enumeration
    $stmt = $mysqli->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if ($user) {
        $resetToken = bin2hex(random_bytes(32));
        $tokenHash  = hash('sha256', $resetToken);
        $expiresAt  = date('Y-m-d H:i:s', time() + 3600); // 1 hour

        // Invalidate old tokens
        $del = $mysqli->prepare('DELETE FROM password_resets WHERE user_id = ?');
        $del->bind_param('i', $user['id']);
        $del->execute();

        $ins = $mysqli->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)');
        $ins->bind_param('iss', $user['id'], $tokenHash, $expiresAt);
        $ins->execute();

        audit_log($mysqli, (int) $user['id'], 'PASSWORD_RESET_REQUEST', 'user', (int) $user['id'], "Reset requested for {$email}");

        // In production, send email. For now return token in dev mode.
        $responseData = ['message' => 'If the email exists, a reset link has been sent.'];
        if (($config['app_env'] ?? 'development') === 'development') {
            $responseData['resetToken'] = $resetToken;
        }
    } else {
        $responseData = ['message' => 'If the email exists, a reset link has been sent.'];
    }

    send_json(200, ['ok' => true, 'data' => $responseData]);
}

// ── Reset Password (with token) ──────────────────────────

if ($action === 'reset_password') {
    $resetToken  = trim((string) ($payload['resetToken'] ?? ''));
    $newPassword = (string) ($payload['newPassword'] ?? '');

    if ($resetToken === '' || $newPassword === '') {
        send_json(422, ['ok' => false, 'error' => 'Token and new password are required']);
    }
    if (strlen($newPassword) < 8) {
        send_json(422, ['ok' => false, 'error' => 'Password must be at least 8 characters']);
    }

    $tokenHash = hash('sha256', $resetToken);
    $stmt = $mysqli->prepare(
        'SELECT * FROM password_resets WHERE token_hash = ? AND expires_at > NOW() AND used_at IS NULL LIMIT 1'
    );
    $stmt->bind_param('s', $tokenHash);
    $stmt->execute();
    $reset = $stmt->get_result()->fetch_assoc();

    if (!$reset) {
        send_json(422, ['ok' => false, 'error' => 'Invalid or expired reset token']);
    }

    $newHash = hash_password($newPassword);
    $upd = $mysqli->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $upd->bind_param('si', $newHash, $reset['user_id']);
    $upd->execute();

    // Mark token as used
    $mark = $mysqli->prepare('UPDATE password_resets SET used_at = NOW() WHERE id = ?');
    $mark->bind_param('i', $reset['id']);
    $mark->execute();

    // Destroy all sessions for security
    destroy_all_sessions($mysqli, (int) $reset['user_id']);

    audit_log($mysqli, (int) $reset['user_id'], 'PASSWORD_RESET', 'user', (int) $reset['user_id'], 'Password reset completed');

    send_json(200, ['ok' => true, 'data' => ['message' => 'Password reset successful. Please log in.']]);
}

// ── Verify Email ─────────────────────────────────────────

if ($action === 'verify_email') {
    $verifyToken = trim((string) ($payload['token'] ?? ''));
    if ($verifyToken === '') {
        send_json(422, ['ok' => false, 'error' => 'Verification token is required']);
    }

    $tokenHash = hash('sha256', $verifyToken);
    $stmt = $mysqli->prepare(
        'SELECT * FROM email_verifications WHERE token_hash = ? AND expires_at > NOW() AND verified_at IS NULL LIMIT 1'
    );
    $stmt->bind_param('s', $tokenHash);
    $stmt->execute();
    $verification = $stmt->get_result()->fetch_assoc();

    if (!$verification) {
        send_json(422, ['ok' => false, 'error' => 'Invalid or expired verification token']);
    }

    // Mark email as verified
    $upd = $mysqli->prepare('UPDATE users SET email_verified_at = NOW() WHERE id = ?');
    $upd->bind_param('i', $verification['user_id']);
    $upd->execute();

    $mark = $mysqli->prepare('UPDATE email_verifications SET verified_at = NOW() WHERE id = ?');
    $mark->bind_param('i', $verification['id']);
    $mark->execute();

    audit_log($mysqli, (int) $verification['user_id'], 'EMAIL_VERIFIED', 'user', (int) $verification['user_id'], 'Email verified');

    send_json(200, ['ok' => true, 'data' => ['message' => 'Email verified successfully.']]);
}

// ── Request Email Verification ───────────────────────────

if ($action === 'request_email_verification') {
    $user = require_auth($mysqli);

    if ($user['email_verified_at'] !== null) {
        send_json(200, ['ok' => true, 'data' => ['message' => 'Email already verified.']]);
    }

    check_rate_limit($mysqli, 'email_verify', 'user:' . $user['id'], 3, 3600);

    $verifyToken = bin2hex(random_bytes(32));
    $tokenHash   = hash('sha256', $verifyToken);
    $expiresAt   = date('Y-m-d H:i:s', time() + 86400); // 24 hours

    $ins = $mysqli->prepare('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?, ?, ?)');
    $ins->bind_param('iss', $user['id'], $tokenHash, $expiresAt);
    $ins->execute();

    $responseData = ['message' => 'Verification email sent.'];
    if (($config['app_env'] ?? 'development') === 'development') {
        $responseData['verifyToken'] = $verifyToken;
    }

    send_json(200, ['ok' => true, 'data' => $responseData]);
}

send_json(400, ['ok' => false, 'error' => 'Invalid action']);
