<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$authUser = require_auth($mysqli);
require_role($authUser, ['administrator', 'agent', 'clerk']);

$method = $_SERVER['REQUEST_METHOD'];

// ── GET ──────────────────────────────────────────────────

if ($method === 'GET') {
    $id = isset($_GET['id']) ? (int) $_GET['id'] : 0;
    if ($id > 0) {
        $stmt = $mysqli->prepare(
            'SELECT u.*, CONCAT(v.first_name, " ", v.last_name) AS verified_by_name
             FROM users u LEFT JOIN users v ON v.id = u.verified_by
             WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1'
        );
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) {
            send_json(404, ['ok' => false, 'error' => 'User not found']);
        }
        send_json(200, ['ok' => true, 'data' => build_user_row($row)]);
    }

    // Paginated list with optional filters
    $pagination = get_pagination_params(50, 200);
    $search     = isset($_GET['search']) ? trim($_GET['search']) : '';
    $roleFilter = isset($_GET['role']) ? trim($_GET['role']) : '';
    $vFilter    = isset($_GET['verification']) ? trim($_GET['verification']) : '';

    $where  = ['u.deleted_at IS NULL'];
    $params = [];
    $types  = '';

    // Clerks can only see buyer/seller
    if ($authUser['user_type'] === 'clerk') {
        $where[] = "u.user_type IN ('buyer', 'seller')";
    }

    if ($search !== '') {
        $like = '%' . escape_like($search) . '%';
        $where[] = '(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)';
        $params = array_merge($params, [$like, $like, $like, $like]);
        $types .= 'ssss';
    }
    if ($roleFilter !== '') { $where[] = 'u.user_type = ?'; $params[] = $roleFilter; $types .= 's'; }
    if ($vFilter !== '')    { $where[] = 'u.verification_status = ?'; $params[] = $vFilter; $types .= 's'; }

    $whereSql = implode(' AND ', $where);

    // Count
    $countSql  = "SELECT COUNT(*) AS total FROM users u WHERE {$whereSql}";
    if ($params) {
        $cStmt = $mysqli->prepare($countSql);
        $cStmt->bind_param($types, ...$params);
        $cStmt->execute();
        $total = (int) $cStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    $sql = "SELECT u.*, CONCAT(v.first_name, ' ', v.last_name) AS verified_by_name
            FROM users u LEFT JOIN users v ON v.id = u.verified_by
            WHERE {$whereSql}
            ORDER BY u.created_at DESC
            LIMIT {$pagination['limit']} OFFSET {$pagination['offset']}";

    if ($params) {
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $mysqli->query($sql);
    }

    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = build_user_row($row);
    }
    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

// ── POST (create) ────────────────────────────────────────

if ($method === 'POST') {
    if ($authUser['user_type'] !== 'administrator') {
        send_json(403, ['ok' => false, 'error' => 'Only administrators can create users']);
    }
    $body      = get_json_body();
    $firstName = sanitize_string((string) ($body['firstName'] ?? ''));
    $lastName  = sanitize_string((string) ($body['lastName']  ?? ''));
    $email     = strtolower(trim((string) ($body['email'] ?? '')));
    $phone     = sanitize_string((string) ($body['phone']     ?? ''), 30);
    $password  = (string) ($body['password'] ?? '');
    $role      = trim((string) ($body['role']      ?? ''));

    if ($firstName === '' || $lastName === '' || $email === '' || $phone === '' || $password === '' || $role === '') {
        send_json(422, ['ok' => false, 'error' => 'All fields are required']);
    }

    $allowed = ['administrator', 'agent', 'seller', 'buyer', 'clerk'];
    if (!in_array($role, $allowed, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid role']);
    }
    if (!validate_email($email)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid email']);
    }
    if (strlen($password) < 8) {
        send_json(422, ['ok' => false, 'error' => 'Password must be at least 8 characters']);
    }

    check_duplicate_user($mysqli, $email, $phone);

    $hash = hash_password($password);
    $ins  = $mysqli->prepare('INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type) VALUES (?, ?, ?, ?, ?, ?)');
    $ins->bind_param('ssssss', $firstName, $lastName, $email, $phone, $hash, $role);
    $ins->execute();

    $userId = (int) $mysqli->insert_id;
    audit_log($mysqli, (int) $authUser['id'], 'CREATE', 'user', $userId, "Admin created {$role}: {$email}");

    $sel = $mysqli->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
    $sel->bind_param('i', $userId);
    $sel->execute();
    $row = $sel->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_user_row($row)]);
}

// ── PUT / PATCH ──────────────────────────────────────────

if ($method === 'PUT' || $method === 'PATCH') {
    $body   = get_json_body();
    $userId = (int) ($body['id'] ?? ($_GET['id'] ?? 0));
    if ($userId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'User ID is required']);
    }

    $sel = $mysqli->prepare(
        'SELECT u.*, CONCAT(v.first_name, " ", v.last_name) AS verified_by_name
         FROM users u LEFT JOIN users v ON v.id = u.verified_by
         WHERE u.id = ? AND u.deleted_at IS NULL LIMIT 1'
    );
    $sel->bind_param('i', $userId);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'User not found']);
    }

    $isAdminUser = $authUser['user_type'] === 'administrator';

    // Admin can edit user details
    if ($isAdminUser) {
        $firstName = sanitize_string((string) ($body['firstName'] ?? $existing['first_name']));
        $lastName  = sanitize_string((string) ($body['lastName']  ?? $existing['last_name']));
        $email     = strtolower(trim((string) ($body['email'] ?? $existing['email'])));
        $phone     = sanitize_string((string) ($body['phone']     ?? $existing['phone']), 30);
        $role      = trim((string) ($body['role']      ?? $existing['user_type']));

        $allowed = ['administrator', 'agent', 'seller', 'buyer', 'clerk'];
        if (!in_array($role, $allowed, true)) {
            send_json(422, ['ok' => false, 'error' => 'Invalid role']);
        }
        if (!validate_email($email)) {
            send_json(422, ['ok' => false, 'error' => 'Invalid email']);
        }

        $dup = $mysqli->prepare('SELECT id FROM users WHERE email = ? AND id <> ? AND deleted_at IS NULL LIMIT 1');
        $dup->bind_param('si', $email, $userId);
        $dup->execute();
        if ($dup->get_result()->fetch_assoc()) {
            send_json(409, ['ok' => false, 'error' => 'Email already in use']);
        }

        $upd = $mysqli->prepare('UPDATE users SET first_name=?, last_name=?, email=?, phone=?, user_type=? WHERE id=?');
        $upd->bind_param('sssssi', $firstName, $lastName, $email, $phone, $role, $userId);
        $upd->execute();

        audit_log($mysqli, (int) $authUser['id'], 'UPDATE', 'user', $userId, "Updated user: {$email}");
    }

    $email = $existing['email'];

    // Handle verification action if present
    $verificationAction = trim((string) ($body['verificationAction'] ?? ''));
    if ($verificationAction === 'verify' || $verificationAction === 'reject') {
        $authRole   = $authUser['user_type'];
        $targetRole = $existing['user_type'];

        // Admin can verify anyone; agent can verify buyer/seller; clerk can verify buyer/seller only
        if ($authRole === 'agent' && !in_array($targetRole, ['buyer', 'seller'], true)) {
            send_json(403, ['ok' => false, 'error' => 'Agents can only verify buyers and sellers']);
        }
        if ($authRole === 'clerk' && !in_array($targetRole, ['buyer', 'seller'], true)) {
            send_json(403, ['ok' => false, 'error' => 'Clerks can only verify buyers and sellers']);
        }
        if (!in_array($authRole, ['administrator', 'agent', 'clerk'], true)) {
            send_json(403, ['ok' => false, 'error' => 'Not authorized to verify users']);
        }

        // Check verification expiration
        if ($existing['verification_status'] === 'verified' && !empty($existing['verification_expires_at'])) {
            if (strtotime($existing['verification_expires_at']) < time()) {
                // Expired verification – auto-reset to pending
                $resetUpd = $mysqli->prepare('UPDATE users SET verification_status = "pending" WHERE id = ?');
                $resetUpd->bind_param('i', $userId);
                $resetUpd->execute();
            }
        }

        $vStatus = $verificationAction === 'verify' ? 'verified' : 'rejected';
        $vNotes  = sanitize_string((string) ($body['verificationNotes'] ?? ''), 1000);
        $vBy     = (int) $authUser['id'];
        $now     = date('Y-m-d H:i:s');
        $verifiedAt = $verificationAction === 'verify' ? $now : null;

        // Set expiration (1 year for verified)
        $expiresAt = $verificationAction === 'verify'
            ? date('Y-m-d H:i:s', strtotime('+1 year'))
            : null;

        $vUpd = $mysqli->prepare(
            'UPDATE users SET verification_status = ?, verification_notes = ?, verified_at = ?,
             verified_by = ?, verification_expires_at = ? WHERE id = ?'
        );
        $vUpd->bind_param('sssisi', $vStatus, $vNotes, $verifiedAt, $vBy, $expiresAt, $userId);
        $vUpd->execute();

        // Log to verification_history
        $hStmt = $mysqli->prepare(
            'INSERT INTO verification_history (user_id, action, performed_by, notes) VALUES (?, ?, ?, ?)'
        );
        $hStmt->bind_param('isis', $userId, $vStatus, $vBy, $vNotes);
        $hStmt->execute();

        audit_log($mysqli, $vBy, 'VERIFY', 'user', $userId, "Verification {$vStatus}: {$email}");

        // Notify the user
        $statusLabel = $verificationAction === 'verify' ? 'approved' : 'rejected';
        $msg = $verificationAction === 'verify'
            ? 'Your identity verification has been approved.'
            : "Your identity verification was rejected. Notes: {$vNotes}";
        create_notification($mysqli, $userId, 'system', "Verification {$statusLabel}", $msg, 'user', $userId);
    }

    $sel->execute();
    $updated = $sel->get_result()->fetch_assoc();
    send_json(200, ['ok' => true, 'data' => build_user_row($updated)]);
}

// ── DELETE (soft delete) ─────────────────────────────────

if ($method === 'DELETE') {
    if ($authUser['user_type'] !== 'administrator') {
        send_json(403, ['ok' => false, 'error' => 'Only administrators can delete users']);
    }

    $id = get_request_id();
    if ($id === (int) $authUser['id']) {
        send_json(403, ['ok' => false, 'error' => 'Cannot delete your own admin account']);
    }

    // Verify user exists and isn't already deleted
    $sel = $mysqli->prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $target = $sel->get_result()->fetch_assoc();
    if (!$target) {
        send_json(404, ['ok' => false, 'error' => 'User not found']);
    }

    soft_delete($mysqli, 'users', $id);

    // Destroy all sessions for deleted user
    destroy_all_sessions($mysqli, $id);

    audit_log($mysqli, (int) $authUser['id'], 'DELETE', 'user', $id, "Soft deleted user: {$target['email']}");

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
