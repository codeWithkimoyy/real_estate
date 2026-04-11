<?php

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';
handle_preflight();
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$result = $mysqli->query('SELECT metric_name, metric_value FROM market_insights ORDER BY metric_name ASC');

$insights = [];
while ($row = $result->fetch_assoc()) {
    $name  = $row['metric_name'];
    $value = $row['metric_value'];

    if (in_array($name, ['avgDaysOnMarket', 'newListingsThisWeek', 'totalActiveListings', 'avgPricePerSqm'], true)) {
        $insights[$name] = (int) $value;
    } elseif ($name === 'priceTrend') {
        $insights[$name] = (float) $value;
    } else {
        $insights[$name] = $value;
    }
}

$expected = ['avgDaysOnMarket', 'priceTrend', 'newListingsThisWeek', 'totalActiveListings', 'avgPricePerSqm'];
foreach ($expected as $metric) {
    if (!isset($insights[$metric])) {
        $insights[$metric] = 0;
    }
}

send_json(200, ['ok' => true, 'data' => $insights]);
