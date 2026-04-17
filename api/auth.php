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
    $phone = (string) $row['phone'];
    $isGoogleUser = str_starts_with($phone, 'google-');
    return [
        'id'                 => (int) $row['id'],
        'firstName'          => (string) $row['first_name'],
        'lastName'           => (string) $row['last_name'],
        'email'              => (string) $row['email'],
        'phone'              => $isGoogleUser ? '' : $phone,
        'role'               => (string) $row['user_type'],
        'avatar'             => $row['avatar'] ?? null,
        'emailVerifiedAt'    => $row['email_verified_at'] ?? null,
        'verificationStatus' => (string) ($row['verification_status'] ?? 'unverified'),
        'isGoogleUser'       => $isGoogleUser,
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

function smtp_read_response($socket): string
{
    $response = '';
    while (($line = fgets($socket, 515)) !== false) {
        $response .= $line;
        // Multi-line SMTP responses use "250-..." until the final "250 ..."
        if (preg_match('/^\d{3}\s/', $line) === 1) {
            break;
        }
    }
    return $response;
}

function smtp_expect_code(string $response, array $expectedCodes): bool
{
    foreach ($expectedCodes as $code) {
        if (str_starts_with($response, (string) $code)) {
            return true;
        }
    }
    return false;
}

function smtp_send_command($socket, string $command, array $expectedCodes): bool
{
    if (fwrite($socket, $command . "\r\n") === false) {
        return false;
    }
    $response = smtp_read_response($socket);
    return smtp_expect_code($response, $expectedCodes);
}

function send_email_via_smtp(string $toEmail, string $subject, string $plainTextBody, ?string $htmlBody = null, ?array $inlineImage = null): bool
{
    global $config;

    $host = trim((string) ($config['smtp_host'] ?? ''));
    $port = (int) ($config['smtp_port'] ?? 587);
    $secure = strtolower(trim((string) ($config['smtp_secure'] ?? 'tls')));
    $username = trim((string) ($config['smtp_user'] ?? ''));
    $password = (string) ($config['smtp_pass'] ?? '');
    $fromEmail = trim((string) ($config['smtp_from'] ?? ''));
    $fromName = trim((string) ($config['smtp_from_name'] ?? 'Brader Real Estate'));
    $timeout = max(5, (int) ($config['smtp_timeout'] ?? 15));

    if ($host === '' || $username === '' || $password === '' || $fromEmail === '') {
        return false;
    }

    $transport = $secure === 'ssl' ? 'ssl://' . $host : 'tcp://' . $host;
    $errno = 0;
    $errstr = '';
    $socket = @stream_socket_client($transport . ':' . $port, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if ($socket === false) {
        error_log('SMTP connect failed: ' . $errstr . ' (' . $errno . ')');
        return false;
    }

    stream_set_timeout($socket, $timeout);

    $greeting = smtp_read_response($socket);
    if (!smtp_expect_code($greeting, [220])) {
        fclose($socket);
        return false;
    }

    if (!smtp_send_command($socket, 'EHLO localhost', [250])) {
        fclose($socket);
        return false;
    }

    if ($secure === 'tls') {
        if (!smtp_send_command($socket, 'STARTTLS', [220])) {
            fclose($socket);
            return false;
        }
        $cryptoOk = @stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        if ($cryptoOk !== true) {
            fclose($socket);
            return false;
        }
        if (!smtp_send_command($socket, 'EHLO localhost', [250])) {
            fclose($socket);
            return false;
        }
    }

    if (!smtp_send_command($socket, 'AUTH LOGIN', [334])) {
        fclose($socket);
        return false;
    }
    if (!smtp_send_command($socket, base64_encode($username), [334])) {
        fclose($socket);
        return false;
    }
    if (!smtp_send_command($socket, base64_encode($password), [235])) {
        fclose($socket);
        return false;
    }

    if (!smtp_send_command($socket, 'MAIL FROM:<' . $fromEmail . '>', [250])) {
        fclose($socket);
        return false;
    }
    if (!smtp_send_command($socket, 'RCPT TO:<' . $toEmail . '>', [250, 251])) {
        fclose($socket);
        return false;
    }
    if (!smtp_send_command($socket, 'DATA', [354])) {
        fclose($socket);
        return false;
    }

    $safeFromName = str_replace(["\r", "\n"], '', $fromName);
    $safeSubject = str_replace(["\r", "\n"], '', $subject);
    $headers = [
        'From: ' . $safeFromName . ' <' . $fromEmail . '>',
        'To: <' . $toEmail . '>',
        'Subject: ' . $safeSubject,
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'MIME-Version: 1.0',
    ];

    if ($htmlBody !== null && trim($htmlBody) !== '') {
        $hasInlineImage =
            is_array($inlineImage)
            && !empty($inlineImage['path'])
            && is_string($inlineImage['path'])
            && file_exists($inlineImage['path']);

        if ($hasInlineImage) {
            $relatedBoundary = '=_brader_rel_' . bin2hex(random_bytes(12));
            $altBoundary = '=_brader_alt_' . bin2hex(random_bytes(12));
            $headers[] = 'Content-Type: multipart/related; boundary="' . $relatedBoundary . '"';

            $imagePath = (string) $inlineImage['path'];
            $imageMime = trim((string) ($inlineImage['mime'] ?? 'image/png'));
            $imageCid = trim((string) ($inlineImage['cid'] ?? 'brand-logo'));
            $imageName = basename($imagePath);
            $imageRaw = file_get_contents($imagePath);
            $imageBase64 = $imageRaw !== false ? chunk_split(base64_encode($imageRaw)) : '';

            $mimeBody = [];
            $mimeBody[] = '--' . $relatedBoundary;
            $mimeBody[] = 'Content-Type: multipart/alternative; boundary="' . $altBoundary . '"';
            $mimeBody[] = '';
            $mimeBody[] = '--' . $altBoundary;
            $mimeBody[] = 'Content-Type: text/plain; charset=UTF-8';
            $mimeBody[] = 'Content-Transfer-Encoding: 8bit';
            $mimeBody[] = '';
            $mimeBody[] = $plainTextBody;
            $mimeBody[] = '';
            $mimeBody[] = '--' . $altBoundary;
            $mimeBody[] = 'Content-Type: text/html; charset=UTF-8';
            $mimeBody[] = 'Content-Transfer-Encoding: 8bit';
            $mimeBody[] = '';
            $mimeBody[] = $htmlBody;
            $mimeBody[] = '';
            $mimeBody[] = '--' . $altBoundary . '--';
            $mimeBody[] = '';

            if ($imageBase64 !== '') {
                $mimeBody[] = '--' . $relatedBoundary;
                $mimeBody[] = 'Content-Type: ' . $imageMime . '; name="' . $imageName . '"';
                $mimeBody[] = 'Content-Transfer-Encoding: base64';
                $mimeBody[] = 'Content-ID: <' . $imageCid . '>';
                $mimeBody[] = 'Content-Disposition: inline; filename="' . $imageName . '"';
                $mimeBody[] = '';
                $mimeBody[] = $imageBase64;
            }

            $mimeBody[] = '--' . $relatedBoundary . '--';

            $data = implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $mimeBody) . "\r\n.\r\n";
        } else {
            $boundary = '=_brader_' . bin2hex(random_bytes(12));
            $headers[] = 'Content-Type: multipart/alternative; boundary="' . $boundary . '"';

            $mimeBody = [];
            $mimeBody[] = '--' . $boundary;
            $mimeBody[] = 'Content-Type: text/plain; charset=UTF-8';
            $mimeBody[] = 'Content-Transfer-Encoding: 8bit';
            $mimeBody[] = '';
            $mimeBody[] = $plainTextBody;
            $mimeBody[] = '';
            $mimeBody[] = '--' . $boundary;
            $mimeBody[] = 'Content-Type: text/html; charset=UTF-8';
            $mimeBody[] = 'Content-Transfer-Encoding: 8bit';
            $mimeBody[] = '';
            $mimeBody[] = $htmlBody;
            $mimeBody[] = '';
            $mimeBody[] = '--' . $boundary . '--';

            $data = implode("\r\n", $headers) . "\r\n\r\n" . implode("\r\n", $mimeBody) . "\r\n.\r\n";
        }
    } else {
        $headers[] = 'Content-Type: text/plain; charset=UTF-8';
        $headers[] = 'Content-Transfer-Encoding: 8bit';
        $data = implode("\r\n", $headers) . "\r\n\r\n" . $plainTextBody . "\r\n.\r\n";
    }

    if (fwrite($socket, $data) === false) {
        fclose($socket);
        return false;
    }

    $queued = smtp_read_response($socket);
    smtp_send_command($socket, 'QUIT', [221]);
    fclose($socket);

    return smtp_expect_code($queued, [250]);
}

function send_password_reset_code_email(string $toEmail, string $resetCode): bool
{
    global $config;
    $appName = trim((string) ($config['smtp_from_name'] ?? 'Brader Real Estate'));
    $subject = 'Your ' . $appName . ' password reset code';
    $safeAppName = htmlspecialchars($appName, ENT_QUOTES, 'UTF-8');
    $safeResetCode = htmlspecialchars($resetCode, ENT_QUOTES, 'UTF-8');
    $logoCid = 'brand-logo';
    $logoPath = __DIR__ . '/../public/images/logo.png';
    $logoAvailable = file_exists($logoPath);

    $body = "Your password reset code is: {$resetCode}\n\n" .
        "This code expires in 1 hour.\n" .
        "If you did not request this, you can ignore this email.";

    $htmlBody = '<!doctype html>' .
        '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' .
        '<body style="margin:0;padding:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#0f2742;">' .
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">' .
        '<tr><td align="center">' .
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e9f0;">' .
        '<tr><td style="padding:24px 24px 8px;text-align:center;">' .
        ($logoAvailable
            ? '<img src="cid:' . $logoCid . '" alt="' . $safeAppName . '" style="max-width:170px;height:auto;display:inline-block;" />'
            : '<h2 style="margin:0;font-size:22px;line-height:1.3;">' . $safeAppName . '</h2>') .
        '</td></tr>' .
        '<tr><td style="padding:8px 24px 0;">' .
        '<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f2742;">Your Password Reset Code</h1>' .
        '<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3f5570;">Use the code below to reset your password. It expires in 1 hour.</p>' .
        '<div style="margin:0 0 18px;padding:14px 16px;background:#0f2742;color:#ffffff;border-radius:12px;text-align:center;font-size:30px;letter-spacing:8px;font-weight:700;">' . $safeResetCode . '</div>' .
        '<p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:#6b7e95;">If you did not request this, you can safely ignore this email.</p>' .
        '</td></tr>' .
        '<tr><td style="padding:14px 24px 24px;background:#f9fbfd;border-top:1px solid #edf1f6;">' .
        '<p style="margin:0;font-size:12px;line-height:1.5;color:#7b8ea6;">Sent by ' . $safeAppName . '</p>' .
        '</td></tr>' .
        '</table></td></tr></table></body></html>';

    $inlineImage = $logoAvailable
        ? ['path' => $logoPath, 'cid' => $logoCid, 'mime' => 'image/png']
        : null;

    return send_email_via_smtp($toEmail, $subject, $body, $htmlBody, $inlineImage);
}

// ── Register ─────────────────────────────────────────────

if ($action === 'register') {
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
    $cachedAvatar = $picture !== '' ? (cache_google_avatar($picture) ?? $picture) : null;

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
        $avatarToStore = $cachedAvatar ?? $picture;
        $updAvatar = $mysqli->prepare('UPDATE users SET avatar = ? WHERE id = ?');
        $uid = (int) $user['id'];
        $updAvatar->bind_param('si', $avatarToStore, $uid);
        $updAvatar->execute();
        $user['avatar'] = $avatarToStore;
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
            $avatar = $cachedAvatar;

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
            $avatar = $cachedAvatar;

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
    $email = strtolower(trim((string) ($payload['email'] ?? '')));
    if ($email === '') {
        send_json(422, ['ok' => false, 'error' => 'Email is required']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(422, ['ok' => false, 'error' => 'Please provide a valid email']);
    }

    $isDev = (($config['app_env'] ?? 'development') === 'development');

    // Always return success to prevent email enumeration
    $stmt = $mysqli->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if ($user) {
        $resetCode = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $tokenHash  = hash('sha256', $resetCode);

        // Invalidate old tokens
        $del = $mysqli->prepare('DELETE FROM password_resets WHERE user_id = ?');
        $del->bind_param('i', $user['id']);
        $del->execute();

        // Use DB server time for expiry to avoid PHP/MySQL timezone drift issues.
        $ins = $mysqli->prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))');
        $ins->bind_param('is', $user['id'], $tokenHash);
        $ins->execute();

        $emailSent = send_password_reset_code_email($email, $resetCode);
        if (!$emailSent) {
            error_log('Failed to send password reset code email to ' . $email);
        }

        audit_log($mysqli, (int) $user['id'], 'PASSWORD_RESET_REQUEST', 'user', (int) $user['id'], "Reset requested for {$email}");

        // Send neutral response to prevent account/email enumeration.
        $responseData = ['message' => 'If the email exists, a reset code has been sent.'];
    } else {
        $responseData = ['message' => 'If the email exists, a reset code has been sent.'];
    }

    send_json(200, ['ok' => true, 'data' => $responseData]);
}

// ── Reset Password (with code) ───────────────────────────

if ($action === 'reset_password') {
    $email       = strtolower(trim((string) ($payload['email'] ?? '')));
    $resetCode   = trim((string) ($payload['resetCode'] ?? ''));
    $newPassword = (string) ($payload['newPassword'] ?? '');

    if ($email === '' || $resetCode === '' || $newPassword === '') {
        send_json(422, ['ok' => false, 'error' => 'Email, reset code, and new password are required']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        send_json(422, ['ok' => false, 'error' => 'Please provide a valid email']);
    }

    $isDev = (($config['app_env'] ?? 'development') === 'development');

    if (!preg_match('/^\d{6}$/', $resetCode)) {
        send_json(422, ['ok' => false, 'error' => 'Reset code must be a 6-digit number']);
    }
    if (strlen($newPassword) < 8) {
        send_json(422, ['ok' => false, 'error' => 'Password must be at least 8 characters']);
    }
    if (strlen($newPassword) > 72) {
        send_json(422, ['ok' => false, 'error' => 'Password must not exceed 72 characters']);
    }

    $userStmt = $mysqli->prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1');
    $userStmt->bind_param('s', $email);
    $userStmt->execute();
    $user = $userStmt->get_result()->fetch_assoc();

    if (!$user) {
        send_json(422, ['ok' => false, 'error' => 'Invalid email or reset code']);
    }

    $tokenHash = hash('sha256', $resetCode);
    $stmt = $mysqli->prepare(
        'SELECT * FROM password_resets WHERE user_id = ? AND token_hash = ? AND expires_at > NOW() AND used_at IS NULL ORDER BY id DESC LIMIT 1'
    );
    $stmt->bind_param('is', $user['id'], $tokenHash);
    $stmt->execute();
    $reset = $stmt->get_result()->fetch_assoc();

    if (!$reset) {
        send_json(422, ['ok' => false, 'error' => 'Invalid or expired reset code']);
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
