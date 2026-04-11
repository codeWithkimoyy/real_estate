<?php
/**
 * Migration: Add reservations table, listing_notes column, proof_document, auto-verify admin
 */

$mysqli = new mysqli('localhost', 'root', '', 'real_estate_db');
if ($mysqli->connect_error) {
    die("Connection failed: " . $mysqli->connect_error . "\n");
}

$queries = [];

// Helper: check if column exists before adding
function col_exists(mysqli $db, string $table, string $col): bool {
    $r = $db->query("SHOW COLUMNS FROM `{$table}` LIKE '{$col}'");
    return $r && $r->num_rows > 0;
}

// 1. Add listing_notes to properties
if (!col_exists($mysqli, 'properties', 'listing_notes')) {
    $queries[] = ["ALTER TABLE properties ADD COLUMN listing_notes TEXT NULL AFTER status", "Added listing_notes"];
} else {
    echo "- listing_notes already exists, skipping\n";
}

// 2. Add reviewed_by to properties
if (!col_exists($mysqli, 'properties', 'reviewed_by')) {
    $queries[] = ["ALTER TABLE properties ADD COLUMN reviewed_by INT NULL AFTER listing_notes", "Added reviewed_by"];
} else {
    echo "- reviewed_by already exists, skipping\n";
}

// 3. Add proof_document to properties
if (!col_exists($mysqli, 'properties', 'proof_document')) {
    $queries[] = ["ALTER TABLE properties ADD COLUMN proof_document VARCHAR(255) NULL AFTER reviewed_by", "Added proof_document"];
} else {
    echo "- proof_document already exists, skipping\n";
}

// 4. Add reservation_fee to properties
if (!col_exists($mysqli, 'properties', 'reservation_fee')) {
    $queries[] = ["ALTER TABLE properties ADD COLUMN reservation_fee INT NULL DEFAULT NULL AFTER proof_document", "Added reservation_fee"];
} else {
    echo "- reservation_fee already exists, skipping\n";
}

// 5. Create reservations table
$queries[] = [
    "DROP TABLE IF EXISTS reservations",
    "Dropped existing reservations table"
];

$queries[] = [
    "CREATE TABLE reservations (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        property_id     INT             NOT NULL,
        user_id         INT             NOT NULL,
        status          ENUM('active','expired','cancelled','completed') NOT NULL DEFAULT 'active',
        expires_at      DATETIME        NOT NULL,
        notes           TEXT            NULL,
        created_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_reservation_property FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_reservation_user     FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_reservation_property (property_id),
        INDEX idx_reservation_user     (user_id),
        INDEX idx_reservation_status   (status),
        INDEX idx_reservation_expires  (expires_at)
    ) ENGINE=InnoDB",
    "Created reservations table"
];

// 6. Auto-verify all existing administrators
$queries[] = [
    "UPDATE users SET verification_status = 'verified', verified_at = NOW() WHERE user_type = 'administrator' AND verification_status != 'verified'",
    "Auto-verified all admin users"
];

// 7. Add verification_expires_at to users
if (!col_exists($mysqli, 'users', 'verification_expires_at')) {
    $queries[] = ["ALTER TABLE users ADD COLUMN verification_expires_at DATETIME NULL AFTER verified_by", "Added verification_expires_at"];
} else {
    echo "- verification_expires_at already exists, skipping\n";
}

foreach ($queries as [$sql, $label]) {
    if ($mysqli->query($sql)) {
        echo "✓ {$label}\n";
    } else {
        echo "✗ {$label}: " . $mysqli->error . "\n";
    }
}

echo "\nMigration completed.\n";
$mysqli->close();
