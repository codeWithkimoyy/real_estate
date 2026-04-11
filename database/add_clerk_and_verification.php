<?php
/**
 * Migration: Add 'clerk' to user_type ENUM and add verification columns.
 */
require_once __DIR__ . '/../api/db.php';

// 1. Add clerk to user_type ENUM
$sql1 = "ALTER TABLE users MODIFY COLUMN user_type ENUM('administrator','agent','seller','buyer','clerk') NOT NULL DEFAULT 'buyer'";
if ($mysqli->query($sql1)) {
    echo "✅ clerk role added to user_type ENUM.\n";
} else {
    echo "❌ user_type: " . $mysqli->error . "\n";
}

// 2. Add verification columns to users
$cols = [
    "ALTER TABLE users ADD COLUMN verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified' AFTER bio",
    "ALTER TABLE users ADD COLUMN verification_document VARCHAR(255) NULL AFTER verification_status",
    "ALTER TABLE users ADD COLUMN verification_notes TEXT NULL AFTER verification_document",
    "ALTER TABLE users ADD COLUMN verified_at DATETIME NULL AFTER verification_notes",
    "ALTER TABLE users ADD COLUMN verified_by INT NULL AFTER verified_at",
];

foreach ($cols as $sql) {
    if ($mysqli->query($sql)) {
        echo "✅ Column added.\n";
    } else {
        if (str_contains($mysqli->error, 'Duplicate column')) {
            echo "ℹ️  Column already exists.\n";
        } else {
            echo "❌ Error: " . $mysqli->error . "\n";
        }
    }
}

// 3. Seed a clerk user (Password: Test@1234)
$hash = '$2y$10$6zE23JSs2yQv625E2EG5VuKORyO8Mae8zFHrCrHdKmg0egphw7xaq';
$check = $mysqli->prepare("SELECT id FROM users WHERE email = 'clerk@estateflow.ph' LIMIT 1");
$check->execute();
if (!$check->get_result()->fetch_assoc()) {
    $ins = $mysqli->prepare("INSERT INTO users (first_name, last_name, email, phone, password_hash, user_type) VALUES ('Front Desk', 'Clerk', 'clerk@estateflow.ph', '+63 917 000 0002', ?, 'clerk')");
    $ins->bind_param('s', $hash);
    $ins->execute();
    echo "✅ Clerk user seeded (clerk@estateflow.ph / Test@1234).\n";
} else {
    echo "ℹ️  Clerk user already exists.\n";
}

echo "\nDone!\n";
