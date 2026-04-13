<?php

declare(strict_types=1);

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$config = require __DIR__ . '/api/config.php';
$dir = __DIR__ . '/database/migrations';

function out(string $message): void
{
    fwrite(STDOUT, $message . PHP_EOL);
}

function checksum_file(string $path): string
{
    $hash = hash_file('sha256', $path);
    if ($hash === false) {
        throw new RuntimeException('Failed to hash file: ' . $path);
    }
    return $hash;
}

function split_sql_statements(string $sql): array
{
    // Simple splitter for semicolon-delimited migration statements.
    $parts = array_map('trim', explode(';', $sql));
    return array_values(array_filter($parts, static fn (string $s) => $s !== ''));
}

try {
    $mysqli = new mysqli(
        $config['db_host'],
        $config['db_user'],
        $config['db_pass'],
        $config['db_name'],
        (int) $config['db_port']
    );
    $mysqli->set_charset('utf8mb4');

    $mysqli->query(
        'CREATE TABLE IF NOT EXISTS migrations (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            checksum CHAR(64) NOT NULL,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );

    if (!is_dir($dir)) {
        throw new RuntimeException('Migrations directory not found: ' . $dir);
    }

    $files = glob($dir . '/*.sql');
    if ($files === false) {
        throw new RuntimeException('Failed reading migrations directory');
    }

    sort($files, SORT_STRING);

    if (!$files) {
        out('No migration files found in database/migrations.');
        exit(0);
    }

    $appliedStmt = $mysqli->query('SELECT name, checksum FROM migrations');
    $applied = [];
    while ($row = $appliedStmt->fetch_assoc()) {
        $applied[$row['name']] = $row['checksum'];
    }

    $appliedCount = 0;

    foreach ($files as $file) {
        $name = basename($file);
        $checksum = checksum_file($file);

        if (isset($applied[$name])) {
            if ($applied[$name] !== $checksum) {
                throw new RuntimeException("Checksum mismatch for applied migration: {$name}");
            }
            out("SKIP  {$name} (already applied)");
            continue;
        }

        $sql = trim((string) file_get_contents($file));
        if ($sql === '') {
            throw new RuntimeException("Migration file is empty: {$name}");
        }

        out("APPLY {$name}");

        $mysqli->begin_transaction();
        try {
            $statements = split_sql_statements($sql);
            foreach ($statements as $statement) {
                $mysqli->query($statement);
            }

            $ins = $mysqli->prepare('INSERT INTO migrations (name, checksum) VALUES (?, ?)');
            $ins->bind_param('ss', $name, $checksum);
            $ins->execute();

            $mysqli->commit();
            $appliedCount++;
        } catch (Throwable $e) {
            $mysqli->rollback();
            throw new RuntimeException("Migration failed ({$name}): " . $e->getMessage(), 0, $e);
        }
    }

    out('Done. Applied migrations: ' . $appliedCount);
    exit(0);
} catch (Throwable $e) {
    fwrite(STDERR, '[migrate] ERROR: ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
