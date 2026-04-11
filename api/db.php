<?php

declare(strict_types=1);

$config = require __DIR__ . '/config.php';

try {
    $mysqli = new mysqli(
        $config['db_host'],
        $config['db_user'],
        $config['db_pass'],
        $config['db_name'],
        (int) $config['db_port']
    );
} catch (\mysqli_sql_exception $e) {
    require_once __DIR__ . '/helpers.php';
    send_json(500, [
        'ok' => false,
        'error' => 'Database connection failed',
    ]);
}

if ($mysqli->connect_error) {
    require_once __DIR__ . '/helpers.php';
    send_json(500, [
        'ok' => false,
        'error' => 'Database connection failed',
    ]);
}

$mysqli->set_charset('utf8mb4');
