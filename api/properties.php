<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

function table_has_column(mysqli $mysqli, string $tableName, string $columnName): bool
{
    global $config;
    $dbName = (string) ($config['db_name'] ?? '');
    if ($dbName === '') return false;

    $stmt = $mysqli->prepare(
        'SELECT 1
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
         LIMIT 1'
    );
    $stmt->bind_param('sss', $dbName, $tableName, $columnName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    return (bool) $row;
}

$propertyHasDeletedAt = table_has_column($mysqli, 'properties', 'deleted_at');
$userHasDeletedAt = table_has_column($mysqli, 'users', 'deleted_at');
$propertyActiveFilterAlias = $propertyHasDeletedAt ? 'p.deleted_at IS NULL' : '1=1';
$propertyActiveFilterNoAlias = $propertyHasDeletedAt ? 'deleted_at IS NULL' : '1=1';
$userActiveFilterNoAlias = $userHasDeletedAt ? 'deleted_at IS NULL' : '1=1';

// ── GET ──────────────────────────────────────────────────

if ($method === 'GET') {
    $user = optional_auth($mysqli);
    expire_stale_reservations_and_release_properties($mysqli);
    $id   = isset($_GET['id']) ? (int) $_GET['id'] : 0;

    if ($id > 0) {
        $stmt = $mysqli->prepare(
            'SELECT p.*, CONCAT(u.first_name, " ", u.last_name) AS owner_name
             FROM properties p
             JOIN users u ON u.id = p.owner_id
               WHERE p.id = ? AND ' . $propertyActiveFilterAlias . ' LIMIT 1'
        );
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        if (!$row) {
            send_json(404, ['ok' => false, 'error' => 'Property not found']);
        }

        // Non-visible lifecycle states stay private until admin approval.
        if (!in_array((string) ($row['status'] ?? ''), property_visible_statuses(), true)) {
            $isPrivileged = $user && in_array($user['user_type'], ['administrator', 'clerk'], true);
            $isOwner = $user && (int) $user['id'] === (int) $row['owner_id'];
            if (!$isPrivileged && !$isOwner) {
                send_json(404, ['ok' => false, 'error' => 'Property not found']);
            }
        }

        // Attach current reservation info
        $propData = build_property_row($row);
        $currentRes = get_current_reservation($mysqli, $id);
        $propData['reservation'] = $currentRes ? [
            'id' => (int) $currentRes['id'],
            'userId' => (int) $currentRes['user_id'],
            'userName' => (string) ($currentRes['user_name'] ?? ''),
            'ownerId' => (int) ($currentRes['owner_id'] ?? 0),
            'ownerName' => (string) ($currentRes['owner_name'] ?? ''),
            'status' => (string) $currentRes['status'],
            'expiresAt' => (string) $currentRes['expires_at'],
            'notes' => $currentRes['notes'] ?? null,
            'paymentIntent' => $currentRes['payment_intent'] ?? null,
            'calculatorSnapshot' => decode_json_field($currentRes['calculator_snapshot'] ?? null),
            'createdAt' => (string) ($currentRes['created_at'] ?? ''),
            'updatedAt' => (string) ($currentRes['updated_at'] ?? ''),
        ] : null;
        send_json(200, ['ok' => true, 'data' => $propData]);
    }

    // List properties with pagination and filtering
    $pagination = get_pagination_params(20, 100);
    $status  = isset($_GET['status']) ? trim($_GET['status']) : null;
    $owner   = isset($_GET['owner_id']) ? (int) $_GET['owner_id'] : 0;
    $search  = isset($_GET['search']) ? trim($_GET['search']) : '';
    $city    = isset($_GET['city']) ? trim($_GET['city']) : '';
    $type    = isset($_GET['type']) ? trim($_GET['type']) : '';
    $minPrice = isset($_GET['min_price']) ? (int) $_GET['min_price'] : 0;
    $maxPrice = isset($_GET['max_price']) ? (int) $_GET['max_price'] : 0;
    $beds    = isset($_GET['beds']) ? (int) $_GET['beds'] : 0;
    $baths   = isset($_GET['baths']) ? (int) $_GET['baths'] : 0;
    $sort    = isset($_GET['sort']) ? trim($_GET['sort']) : 'newest';

    $where  = [$propertyActiveFilterAlias];
    $params = [];
    $types  = '';

    // Role-based visibility
    if ($user && $user['user_type'] === 'administrator') {
        if ($status && $status !== 'all') { $where[] = 'p.status = ?'; $params[] = $status; $types .= 's'; }
        if ($owner > 0) { $where[] = 'p.owner_id = ?'; $params[] = $owner; $types .= 'i'; }
    } elseif ($user && in_array($user['user_type'], ['seller', 'agent'], true) && $owner === (int) $user['id']) {
        // Seller/agent viewing their own listings: show all statuses unless filtered
        $where[] = 'p.owner_id = ?'; $params[] = (int) $user['id']; $types .= 'i';
        if ($status && $status !== 'all') { $where[] = 'p.status = ?'; $params[] = $status; $types .= 's'; }
    } else {
        if ($status && $status !== 'all') {
            $where[] = 'p.status = ?';
            $params[] = $status;
            $types .= 's';
        } else {
            $where[] = "p.status = 'available'";
        }
    }

    // Full-text search
    if ($search !== '') {
        $where[] = 'MATCH(p.title, p.description, p.address, p.city) AGAINST(? IN BOOLEAN MODE)';
        $params[] = $search;
        $types .= 's';
    }

    // Filters
    if ($city !== '') { $where[] = 'p.city = ?'; $params[] = $city; $types .= 's'; }
    if ($type !== '') { $where[] = 'p.property_type = ?'; $params[] = $type; $types .= 's'; }
    if ($minPrice > 0) { $where[] = 'p.price >= ?'; $params[] = $minPrice; $types .= 'i'; }
    if ($maxPrice > 0) { $where[] = 'p.price <= ?'; $params[] = $maxPrice; $types .= 'i'; }
    if ($beds > 0) { $where[] = 'p.beds >= ?'; $params[] = $beds; $types .= 'i'; }
    if ($baths > 0) { $where[] = 'p.baths >= ?'; $params[] = $baths; $types .= 'i'; }

    $whereSql = implode(' AND ', $where);

    // Sort
    $orderBy = match ($sort) {
        'price_asc'  => 'p.price ASC',
        'price_desc' => 'p.price DESC',
        'sqm'        => 'p.sqm DESC',
        'oldest'     => 'p.created_at ASC',
        default      => 'p.created_at DESC',
    };

    // Count total
    $countSql = "SELECT COUNT(*) AS total FROM properties p WHERE {$whereSql}";
    if ($params) {
        $countStmt = $mysqli->prepare($countSql);
        $countStmt->bind_param($types, ...$params);
        $countStmt->execute();
        $total = (int) $countStmt->get_result()->fetch_assoc()['total'];
    } else {
        $total = (int) $mysqli->query($countSql)->fetch_assoc()['total'];
    }

    // Fetch page
    $sql = "SELECT p.*, CONCAT(u.first_name, ' ', u.last_name) AS owner_name
            FROM properties p
            JOIN users u ON u.id = p.owner_id
            WHERE {$whereSql}
            ORDER BY {$orderBy}
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
        $rows[] = build_property_row($row);
    }

    send_json(200, paginated_response($rows, $total, $pagination['page'], $pagination['limit']));
}

// ── POST (create) ────────────────────────────────────────

if ($method === 'POST') {
    $user = require_auth($mysqli);
    require_role($user, ['seller', 'agent', 'administrator']);

    check_rate_limit($mysqli, 'create_property', 'user:' . $user['id'], 10, 3600);

    // Non-admin must be verified
    if ($user['user_type'] !== 'administrator') {
        $vStatus = $user['verification_status'] ?? 'unverified';
        if ($vStatus !== 'verified') {
            send_json(403, ['ok' => false, 'error' => 'You must be verified to create listings. Please submit verification documents from your profile.']);
        }
    }

    $body = get_json_body();
    $submitForApproval = !array_key_exists('submitForApproval', $body) || (bool) $body['submitForApproval'];

    $required = ['title', 'address', 'city', 'province', 'price', 'beds', 'baths', 'propertyType', 'description'];
    foreach ($required as $field) {
        if (empty($body[$field]) && $body[$field] !== 0) {
            send_json(422, ['ok' => false, 'error' => "Field '{$field}' is required"]);
        }
    }

    $title        = sanitize_string((string) $body['title']);
    $address      = sanitize_string((string) $body['address']);
    $city         = sanitize_string((string) $body['city'], 120);
    $province     = sanitize_string((string) $body['province'], 120);
    $zipCode      = sanitize_string((string) ($body['zipCode'] ?? ''), 20);
    $price        = (int) $body['price'];
    $beds         = (int) $body['beds'];
    $baths        = (int) $body['baths'];
    $sqft         = (int) ($body['sqft'] ?? 0);
    $sqm          = (int) ($body['sqm'] ?? 0);
    $propertyType = trim((string) $body['propertyType']);
    $status       = $submitForApproval ? 'pending_approval' : 'draft';
    $image        = sanitize_string((string) ($body['image'] ?? '/images/property1.jpg'));
    $images       = json_encode($body['images'] ?? [$image]);
    $description  = trim((string) $body['description']);
    $amenities    = json_encode($body['amenities'] ?? []);
    $yearBuilt    = isset($body['yearBuilt']) && $body['yearBuilt'] !== '' ? (int) $body['yearBuilt'] : null;
    $lotSize      = isset($body['lotSize']) && $body['lotSize'] !== '' ? (int) $body['lotSize'] : null;
    $garage       = (int) ($body['garage'] ?? 0);
    $pool         = (int) (bool) ($body['pool'] ?? false);
    $furnished    = (int) (bool) ($body['furnished'] ?? false);
    $ownerId      = (int) $user['id'];
    $latitude     = isset($body['latitude']) ? (float) $body['latitude'] : null;
    $longitude    = isset($body['longitude']) ? (float) $body['longitude'] : null;
    $interestRate = isset($body['interestRate']) ? (float) $body['interestRate'] : 6.50;
    $proofDoc     = sanitize_string((string) ($body['proofDocument'] ?? ''));

    if ($price <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Price must be greater than zero']);
    }
    if ($proofDoc === '') {
        send_json(422, ['ok' => false, 'error' => 'Proof of ownership or listing authority is required']);
    }

    $validTypes = ['house', 'condo', 'townhome', 'apartment', 'lot'];
    if (!in_array($propertyType, $validTypes, true)) {
        send_json(422, ['ok' => false, 'error' => 'Invalid property type']);
    }

    $stmt = $mysqli->prepare(
        'INSERT INTO properties (title, address, city, province, zip_code, price, beds, baths, sqft, sqm,
         property_type, status, image, images, description, amenities, year_built, lot_size,
         garage, pool, furnished, owner_id, latitude, longitude, interest_rate, proof_document)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->bind_param(
        'sssssiiiiiisssssiiiiiiddds',
        $title, $address, $city, $province, $zipCode, $price, $beds, $baths, $sqft, $sqm,
        $propertyType, $status, $image, $images, $description, $amenities, $yearBuilt, $lotSize,
        $garage, $pool, $furnished, $ownerId, $latitude, $longitude, $interestRate, $proofDoc
    );
    $stmt->execute();

    $newId = (int) $mysqli->insert_id;
    audit_log($mysqli, (int) $user['id'], 'CREATE', 'property', $newId, "Created listing: {$title}");

    // Notify admins of new listings awaiting approval.
    if ($status === 'pending_approval') {
        $admins = $mysqli->query("SELECT id FROM users WHERE user_type = 'administrator' AND {$userActiveFilterNoAlias}");
        while ($admin = $admins->fetch_assoc()) {
            create_notification($mysqli, (int) $admin['id'], 'system', 'New Listing Pending Approval', "A new property \"{$title}\" requires approval.", 'property', $newId);
        }
    }

    $sel = $mysqli->prepare(
        'SELECT p.*, CONCAT(u.first_name, " ", u.last_name) AS owner_name
         FROM properties p JOIN users u ON u.id = p.owner_id WHERE p.id = ? LIMIT 1'
    );
    $sel->bind_param('i', $newId);
    $sel->execute();
    $newRow = $sel->get_result()->fetch_assoc();

    send_json(201, ['ok' => true, 'data' => build_property_row($newRow)]);
}

// ── PUT / PATCH ──────────────────────────────────────────

if ($method === 'PUT' || $method === 'PATCH') {
    $user = require_auth($mysqli);
    $body = get_json_body();

    $propId = isset($body['id']) ? (int) $body['id'] : (isset($_GET['id']) ? (int) $_GET['id'] : 0);
    if ($propId <= 0) {
        send_json(422, ['ok' => false, 'error' => 'Property ID is required']);
    }

    $sel = $mysqli->prepare('SELECT * FROM properties WHERE id = ? AND ' . $propertyActiveFilterNoAlias . ' LIMIT 1');
    $sel->bind_param('i', $propId);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }

    $isAdmin = $user['user_type'] === 'administrator';
    $isOwner = (int) $existing['owner_id'] === (int) $user['id'];

    if (!$isAdmin && !$isOwner) {
        send_json(403, ['ok' => false, 'error' => 'You can only edit your own properties']);
    }

    // Admin-only: Approve / Reject
    $action = trim((string) ($_GET['action'] ?? ($body['action'] ?? '')));
    if ($action === 'approve' || $action === 'reject') {
        if (!$isAdmin) {
            send_json(403, ['ok' => false, 'error' => 'Only administrators can approve/reject listings']);
        }
        if ((string) $existing['status'] !== 'pending_approval') {
            send_json(422, ['ok' => false, 'error' => 'Only listings pending approval can be reviewed']);
        }
        $newStatus = $action === 'approve' ? 'available' : 'draft';
        $upd = $mysqli->prepare('UPDATE properties SET status = ? WHERE id = ?');
        $upd->bind_param('si', $newStatus, $propId);
        $upd->execute();

        audit_log($mysqli, (int) $user['id'], strtoupper($action), 'property', $propId, "Property {$action}d");

        // Notify property owner
        $ownerId = (int) $existing['owner_id'];
        if ($action === 'approve') {
            create_notification($mysqli, $ownerId, 'system', 'Listing Approved', "Your property \"{$existing['title']}\" is now available to buyers.", 'property', $propId);
        } else {
            create_notification($mysqli, $ownerId, 'system', 'Listing Returned to Draft', "Your property \"{$existing['title']}\" needs updates before it can be approved.", 'property', $propId);
        }

        $sel->execute();
        $updated = $sel->get_result()->fetch_assoc();
        $updated['owner_name'] = '';
        send_json(200, ['ok' => true, 'data' => build_property_row($updated)]);
    }

    // General update
    $title        = sanitize_string((string) ($body['title']       ?? $existing['title']));
    $address      = sanitize_string((string) ($body['address']     ?? $existing['address']));
    $city         = sanitize_string((string) ($body['city']        ?? $existing['city']), 120);
    $province     = sanitize_string((string) ($body['province']    ?? $existing['province']), 120);
    $zipCode      = sanitize_string((string) ($body['zipCode']     ?? $existing['zip_code']), 20);
    $price        = (int) ($body['price']               ?? $existing['price']);
    $beds         = (int) ($body['beds']                ?? $existing['beds']);
    $baths        = (int) ($body['baths']               ?? $existing['baths']);
    $sqft         = (int) ($body['sqft']                ?? $existing['sqft']);
    $sqm          = (int) ($body['sqm']                 ?? $existing['sqm']);
    $propertyType = trim((string) ($body['propertyType'] ?? $existing['property_type']));
    $image        = sanitize_string((string) ($body['image']       ?? $existing['image']));
    $images       = isset($body['images']) ? json_encode($body['images']) : $existing['images'];
    $description  = trim((string) ($body['description'] ?? $existing['description']));
    $amenities    = isset($body['amenities']) ? json_encode($body['amenities']) : $existing['amenities'];
    $yearBuilt    = $body['yearBuilt'] ?? $existing['year_built'];
    $lotSize      = $body['lotSize']   ?? $existing['lot_size'];
    $garage       = (int) ($body['garage']    ?? $existing['garage']);
    $pool         = (int) (bool) ($body['pool']       ?? $existing['pool']);
    $furnished    = (int) (bool) ($body['furnished']  ?? $existing['furnished']);
    $interestRate = isset($body['interestRate']) ? (float) $body['interestRate'] : (float) $existing['interest_rate'];
    $submitForApproval = !array_key_exists('submitForApproval', $body) || (bool) $body['submitForApproval'];

    if (!$isAdmin && in_array((string) $existing['status'], ['reserved', 'under_offer', 'sold'], true)) {
        send_json(422, ['ok' => false, 'error' => 'This listing cannot be edited while it is reserved, under offer, or sold']);
    }

    // Non-admin edits return the listing to the approval workflow.
    $status = $isAdmin
        ? (string) $existing['status']
        : ($submitForApproval ? 'pending_approval' : 'draft');

    $upd = $mysqli->prepare(
        'UPDATE properties SET title=?, address=?, city=?, province=?, zip_code=?, price=?, beds=?, baths=?,
         sqft=?, sqm=?, property_type=?, status=?, image=?, images=?, description=?, amenities=?,
         year_built=?, lot_size=?, garage=?, pool=?, furnished=?, interest_rate=?
         WHERE id=?'
    );
    $upd->bind_param(
        'ssssiiiiiissssssiiiiiddi',
        $title, $address, $city, $province, $zipCode, $price, $beds, $baths,
        $sqft, $sqm, $propertyType, $status, $image, $images, $description, $amenities,
        $yearBuilt, $lotSize, $garage, $pool, $furnished, $interestRate, $propId
    );
    $upd->execute();

    audit_log($mysqli, (int) $user['id'], 'UPDATE', 'property', $propId, "Updated: {$title}");

    $sel2 = $mysqli->prepare(
        'SELECT p.*, CONCAT(u.first_name, " ", u.last_name) AS owner_name
         FROM properties p JOIN users u ON u.id = p.owner_id WHERE p.id = ? LIMIT 1'
    );
    $sel2->bind_param('i', $propId);
    $sel2->execute();
    $updatedRow = $sel2->get_result()->fetch_assoc();

    send_json(200, ['ok' => true, 'data' => build_property_row($updatedRow)]);
}

// ── DELETE (soft delete) ─────────────────────────────────

if ($method === 'DELETE') {
    $user = require_auth($mysqli);
    $id   = get_request_id();

    $sel = $mysqli->prepare('SELECT * FROM properties WHERE id = ? AND ' . $propertyActiveFilterNoAlias . ' LIMIT 1');
    $sel->bind_param('i', $id);
    $sel->execute();
    $existing = $sel->get_result()->fetch_assoc();
    if (!$existing) {
        send_json(404, ['ok' => false, 'error' => 'Property not found']);
    }

    $isAdmin = $user['user_type'] === 'administrator';
    $isOwner = (int) $existing['owner_id'] === (int) $user['id'];
    if (!$isAdmin && !$isOwner) {
        send_json(403, ['ok' => false, 'error' => 'You can only delete your own properties']);
    }

    soft_delete($mysqli, 'properties', $id);
    audit_log($mysqli, (int) $user['id'], 'DELETE', 'property', $id, "Soft deleted: {$existing['title']}");

    send_json(200, ['ok' => true, 'data' => ['deletedId' => $id]]);
}

send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
