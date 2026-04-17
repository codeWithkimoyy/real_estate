<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

$authUser = require_auth($mysqli);
$method   = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

check_rate_limit($mysqli, 'upload', 'user:' . $authUser['id'], 20, 60);

// ── Validate upload ──────────────────────────────────────

if (empty($_FILES['file'])) {
    send_json(422, ['ok' => false, 'error' => 'No file uploaded']);
}

$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    send_json(422, ['ok' => false, 'error' => 'Upload error code: ' . $file['error']]);
}

// Max size from config
$maxSizeMb = $config['upload_max_size_mb'] ?? 5;
$maxSize = $maxSizeMb * 1024 * 1024;
if ($file['size'] > $maxSize) {
    send_json(422, ['ok' => false, 'error' => "File too large. Maximum {$maxSizeMb} MB."]);
}

// 1. MIME type validation via finfo
$allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = $finfo->file($file['tmp_name']);

if (!in_array($mime, $allowedMimes, true)) {
    send_json(422, ['ok' => false, 'error' => 'Invalid file type. Allowed: JPG, PNG, GIF, WEBP.']);
}

// 2. Extension validation
$originalName = $file['name'];
$ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
if (!in_array($ext, $allowedExts, true)) {
    send_json(422, ['ok' => false, 'error' => 'Invalid file extension. Allowed: jpg, jpeg, png, gif, webp.']);
}

// 3. getimagesize() validation — confirms it's actually an image
$imageInfo = @getimagesize($file['tmp_name']);
if ($imageInfo === false) {
    send_json(422, ['ok' => false, 'error' => 'File is not a valid image.']);
}

// Validate image type matches the expected MIME
$allowedImageTypes = [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_GIF, IMAGETYPE_WEBP];
if (!in_array($imageInfo[2], $allowedImageTypes, true)) {
    send_json(422, ['ok' => false, 'error' => 'Image type mismatch detected.']);
}

// 4. Cross-check: extension matches MIME
$extMap = [
    'image/jpeg' => ['jpg', 'jpeg'],
    'image/png'  => ['png'],
    'image/gif'  => ['gif'],
    'image/webp' => ['webp'],
];
if (!isset($extMap[$mime]) || !in_array($ext, $extMap[$mime], true)) {
    send_json(422, ['ok' => false, 'error' => 'File extension does not match content type.']);
}

// Normalize extension
$normalizedExt = ($ext === 'jpeg') ? 'jpg' : $ext;

// ── Save file outside public directory ───────────────────

$uploadDir = $config['upload_dir'] ?? (__DIR__ . '/../storage/uploads');

// Resolve to absolute path
if (!str_starts_with($uploadDir, '/') && !preg_match('/^[A-Z]:\\\\/i', $uploadDir)) {
    $uploadDir = __DIR__ . '/' . $uploadDir;
}
$uploadDir = realpath($uploadDir) ?: $uploadDir;

if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0750, true)) {
        send_json(500, ['ok' => false, 'error' => 'Failed to create upload directory']);
    }
}

// Write .htaccess to prevent direct execution if served by Apache
$htaccess = $uploadDir . '/.htaccess';
if (!file_exists($htaccess)) {
    try {
        file_put_contents($htaccess, "Options -Indexes\nRemoveHandler .php .phtml .php3 .php4 .php5\nForceType application/octet-stream\n<FilesMatch \"\\.(?:php|phtml|php[345])$\">\n  Require all denied\n</FilesMatch>");
    } catch (Throwable $e) {
        error_log('upload.php: failed to write .htaccess in upload directory: ' . $e->getMessage());
    }
}

$filename = bin2hex(random_bytes(16)) . '.' . $normalizedExt;
$destPath = $uploadDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $destPath)) {
    send_json(500, ['ok' => false, 'error' => 'Failed to save file']);
}

// Set restrictive permissions (best effort; do not fail successful upload)
try {
    chmod($destPath, 0640);
} catch (Throwable $e) {
    error_log('upload.php: failed to chmod uploaded file: ' . $e->getMessage());
}

// Return a URL aligned with this repository layout (assets are served from /public).
$publicUrl = '/public/images/uploads/' . $filename;

// If storage is outside public, also copy to public for serving (backward compat)
$publicDir = __DIR__ . '/../public/images/uploads';
if (!is_dir($publicDir)) {
    try {
        if (!mkdir($publicDir, 0755, true) && !is_dir($publicDir)) {
            error_log('upload.php: failed to create public upload directory: ' . $publicDir);
        }
    } catch (Throwable $e) {
        error_log('upload.php: exception creating public upload directory: ' . $e->getMessage());
    }
}
$publicPath = $publicDir . '/' . $filename;

// Avoid noisy warnings (which break JSON) if upload_dir already points to public path.
$destReal = realpath($destPath) ?: $destPath;
$publicReal = realpath($publicPath) ?: $publicPath;
if ($destReal !== $publicReal) {
    if (!@copy($destPath, $publicPath)) {
        error_log('upload.php: failed to copy uploaded file to public path: ' . $publicPath);
    }
}

try {
    audit_log($mysqli, (int) $authUser['id'], 'UPLOAD', 'file', null, "Uploaded: {$filename} ({$mime}, {$file['size']} bytes)");
} catch (Throwable $e) {
    // Audit failures should never turn a successful upload into an API error.
    error_log('upload.php: audit log failed: ' . $e->getMessage());
}

send_json(200, [
    'ok'   => true,
    'data' => [
        'url'      => $publicUrl,
        'filename' => $filename,
        'size'     => $file['size'],
        'mime'     => $mime,
    ],
]);
