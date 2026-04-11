<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$authUser = require_auth($mysqli);
$method   = $_SERVER['REQUEST_METHOD'];
$userId   = (int) $authUser['id'];

// ── GET – Fetch own profile ──────────────────────────────

if ($method === 'GET') {
    $stmt = $mysqli->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        send_json(404, ['ok' => false, 'error' => 'User not found']);
    }
    send_json(200, ['ok' => true, 'data' => build_user_row($row)]);
}

// ── PUT – Update profile fields ──────────────────────────

if ($method === 'PUT') {
    $body = get_json_body();

    $stmt = $mysqli->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'User not found']);
    }

    $firstName = sanitize_string((string) ($body['firstName'] ?? $existing['first_name']));
    $lastName  = sanitize_string((string) ($body['lastName']  ?? $existing['last_name']));
    $email     = strtolower(trim((string) ($body['email'] ?? $existing['email'])));
    $phone     = sanitize_string((string) ($body['phone']     ?? $existing['phone']), 30);
    $bio       = array_key_exists('bio', $body) ? sanitize_string((string) $body['bio'], 1000) : ($existing['bio'] ?? '');
    $avatar    = array_key_exists('avatar', $body) ? sanitize_string((string) $body['avatar']) : ($existing['avatar'] ?? '');

    if ($firstName === '' || $lastName === '') {
        send_json(422, ['ok' => false, 'error' => 'First name and last name are required']);
    }
    if (!validate_email($email)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid email format']);
    }

    // Check duplicate email
    $dup = $mysqli->prepare('SELECT id FROM users WHERE email = ? AND id <> ? AND deleted_at IS NULL LIMIT 1');
    $dup->bind_param('si', $email, $userId);
    $dup->execute();
    if ($dup->get_result()->fetch_assoc()) {
        send_json(409, ['ok' => false, 'error' => 'Email already in use by another account']);
    }

    $upd = $mysqli->prepare('UPDATE users SET first_name=?, last_name=?, email=?, phone=?, bio=?, avatar=? WHERE id=?');
    $upd->bind_param('ssssssi', $firstName, $lastName, $email, $phone, $bio, $avatar, $userId);
    $upd->execute();

    audit_log($mysqli, $userId, 'UPDATE', 'user', $userId, 'Profile updated');

    $stmt->execute();
    $updated = $stmt->get_result()->fetch_assoc();
    send_json(200, ['ok' => true, 'data' => build_user_row($updated)]);
}

// ── PATCH – Change password ──────────────────────────────

if ($method === 'PATCH') {
    $body           = get_json_body();
    $currentPassword = (string) ($body['currentPassword'] ?? '');
    $newPassword     = (string) ($body['newPassword'] ?? '');

    if ($currentPassword === '' || $newPassword === '') {
        send_json(422, ['ok' => false, 'error' => 'Current password and new password are required']);
    }
    if (strlen($newPassword) < 8) {
        send_json(422, ['ok' => false, 'error' => 'New password must be at least 8 characters']);
    }

    check_rate_limit($mysqli, 'change_password', 'user:' . $userId, 5, 900);

    $stmt = $mysqli->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();

    if (!$row || !password_verify($currentPassword, $row['password_hash'])) {
        send_json(401, ['ok' => false, 'error' => 'Current password is incorrect']);
    }

    $newHash = hash_password($newPassword);
    $upd = $mysqli->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $upd->bind_param('si', $newHash, $userId);
    $upd->execute();

    audit_log($mysqli, $userId, 'UPDATE', 'user', $userId, 'Password changed');

    send_json(200, ['ok' => true, 'data' => ['message' => 'Password changed successfully']]);
}

// ── POST – Submit verification document ──────────────────

if ($method === 'POST') {
    $body    = get_json_body();
    $action  = trim((string) ($body['action'] ?? ''));

    if ($action === 'submit_verification') {
        $document = sanitize_string((string) ($body['document'] ?? ''));
        if ($document === '') {
            send_json(422, ['ok' => false, 'error' => 'Please upload a verification document']);
        }
        $idType = sanitize_string((string) ($body['idType'] ?? ''), 50);
        $docType = sanitize_string((string) ($body['documentType'] ?? ''), 50);

        // Check current verification status – allow resubmission if rejected
        $chk = $mysqli->prepare('SELECT verification_status FROM users WHERE id = ? LIMIT 1');
        $chk->bind_param('i', $userId);
        $chk->execute();
        $current = $chk->get_result()->fetch_assoc();
        if ($current && $current['verification_status'] === 'verified') {
            send_json(400, ['ok' => false, 'error' => 'You are already verified']);
        }

        $upd = $mysqli->prepare(
            'UPDATE users SET verification_document = ?, id_type = ?, verification_document_type = ?,
             verification_status = "pending" WHERE id = ?'
        );
        $upd->bind_param('sssi', $document, $idType, $docType, $userId);
        $upd->execute();

        // Log to verification_history
        $hStmt = $mysqli->prepare(
            'INSERT INTO verification_history (user_id, action, performed_by, notes) VALUES (?, "submitted", ?, "Document submitted for review")'
        );
        $hStmt->bind_param('ii', $userId, $userId);
        $hStmt->execute();

        audit_log($mysqli, $userId, 'UPDATE', 'user', $userId, 'Verification document submitted');

        // Notify admins
        $admins = $mysqli->query("SELECT id FROM users WHERE user_type = 'administrator' AND deleted_at IS NULL");
        $userName = $authUser['first_name'] . ' ' . $authUser['last_name'];
        while ($admin = $admins->fetch_assoc()) {
            create_notification($mysqli, (int) $admin['id'], 'system', 'Verification Request', "{$userName} submitted verification documents for review.", 'user', $userId);
        }

        $sel = $mysqli->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $sel->bind_param('i', $userId);
        $sel->execute();
        $updated = $sel->get_result()->fetch_assoc();
        send_json(200, ['ok' => true, 'data' => build_user_row($updated)]);
    }

    send_json(422, ['ok' => false, 'error' => 'Unknown action']);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
