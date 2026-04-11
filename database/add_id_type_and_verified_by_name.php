<?php
/**
 * Migration: Add id_type column to users table.
 */
require_once __DIR__ . '/../api/db.php';

function col_exists(mysqli $db, string $table, string $col): bool {
    $r = $db->query("SHOW COLUMNS FROM `{$table}` LIKE '{$col}'");
    return $r && $r->num_rows > 0;
}

// 1. Add id_type column
if (!col_exists($mysqli, 'users', 'id_type')) {
    $sql = "ALTER TABLE users ADD COLUMN id_type VARCHAR(50) NULL AFTER verification_document";
    if ($mysqli->query($sql)) {
        echo "✅ id_type column added to users.\n";
    } else {
        echo "❌ id_type: " . $mysqli->error . "\n";
    }
} else {
    echo "ℹ️  id_type column already exists.\n";
}

echo "\nDone!\n";
