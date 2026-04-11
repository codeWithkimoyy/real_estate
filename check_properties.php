<?php
require_once __DIR__ . '/api/db.php';

echo "=== ALL PROPERTIES ===\n";
$r = $mysqli->query('SELECT id, title, status, owner_id, created_at FROM properties ORDER BY title, status');
while ($row = $r->fetch_assoc()) {
    echo $row['id'] . ' | ' . str_pad($row['status'], 10) . ' | owner:' . $row['owner_id'] . ' | ' . $row['created_at'] . ' | ' . $row['title'] . PHP_EOL;
}

echo "\n=== DUPLICATE TITLES ===\n";
$d = $mysqli->query("SELECT title, COUNT(*) as cnt, GROUP_CONCAT(id ORDER BY id) as ids, GROUP_CONCAT(status ORDER BY id) as statuses FROM properties GROUP BY title HAVING cnt > 1");
while ($row = $d->fetch_assoc()) {
    echo "'{$row['title']}' => IDs: {$row['ids']} | Statuses: {$row['statuses']}\n";
}

echo "\n=== COUNT BY STATUS ===\n";
$c = $mysqli->query('SELECT status, COUNT(*) as cnt FROM properties GROUP BY status');
while ($row = $c->fetch_assoc()) {
    echo "{$row['status']}: {$row['cnt']}\n";
}
