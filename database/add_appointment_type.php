<?php
/**
 * Migration: Add appointment_type column to appointments table.
 */
require_once __DIR__ . '/../api/db.php';

$sql = "ALTER TABLE appointments ADD COLUMN appointment_type ENUM('viewing','walk_in_payment') NOT NULL DEFAULT 'viewing' AFTER notes";

if ($mysqli->query($sql)) {
    echo "✅ appointment_type column added successfully.\n";
} else {
    if (str_contains($mysqli->error, 'Duplicate column')) {
        echo "ℹ️  Column appointment_type already exists.\n";
    } else {
        echo "❌ Error: " . $mysqli->error . "\n";
    }
}
