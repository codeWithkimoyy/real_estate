<?php

declare(strict_types=1);

/* =========================================================
   Configuration – loads from .env file
   ========================================================= */

if (!function_exists('load_env')) {
    function load_env(string $path): void
    {
        if (!file_exists($path)) return;
        $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') continue;
            if (strpos($line, '=') === false) continue;
            [$key, $value] = explode('=', $line, 2);
            $key   = trim($key);
            $value = trim($value);
            if (!array_key_exists($key, $_ENV)) {
                $_ENV[$key] = $value;
                putenv("{$key}={$value}");
            }
        }
    }

    load_env(__DIR__ . '/../.env');
}

if (!function_exists('env')) {
    function env(string $key, string $default = ''): string
    {
        return $_ENV[$key] ?? getenv($key) ?: $default;
    }
}

if (!function_exists('env_int')) {
    function env_int(string $key, int $default = 0): int
    {
        $val = env($key, (string) $default);
        return (int) $val;
    }
}

if (!function_exists('env_bool')) {
    function env_bool(string $key, bool $default = false): bool
    {
        $val = strtolower(env($key, $default ? 'true' : 'false'));
        return in_array($val, ['true', '1', 'yes', 'on'], true);
    }
}

return [
    // Database
    'db_host' => env('DB_HOST', '127.0.0.1'),
    'db_port' => env_int('DB_PORT', 3306),
    'db_name' => env('DB_NAME', 'real_estate_db'),
    'db_user' => env('DB_USER', 'root'),
    'db_pass' => env('DB_PASS', ''),

    // Application
    'app_env'    => env('APP_ENV', 'development'),
    'app_url'    => env('APP_URL', 'http://localhost/Activities/real_estate'),
    'app_secret' => env('APP_SECRET', ''),

    // CORS
    'cors_origins' => array_filter(array_map('trim', explode(',', env('CORS_ORIGINS', 'http://localhost:5173')))),

    // Session
    'session_lifetime_hours' => env_int('SESSION_LIFETIME_HOURS', 168),
    'session_max_per_user'   => env_int('SESSION_MAX_PER_USER', 5),

    // Rate limiting
    'rate_limit_login_max'    => env_int('RATE_LIMIT_LOGIN_MAX', 15),
    'rate_limit_login_window' => env_int('RATE_LIMIT_LOGIN_WINDOW', 900),
    'rate_limit_api_max'      => env_int('RATE_LIMIT_API_MAX', 100),
    'rate_limit_api_window'   => env_int('RATE_LIMIT_API_WINDOW', 60),

    // Bcrypt
    'bcrypt_cost' => env_int('BCRYPT_COST', 12),

    // Upload
    'upload_max_size_mb' => env_int('UPLOAD_MAX_SIZE_MB', 5),
    'upload_dir'         => env('UPLOAD_DIR', '../storage/uploads'),

    // Email
    'smtp_host'      => env('SMTP_HOST', ''),
    'smtp_port'      => env_int('SMTP_PORT', 587),
    'smtp_secure'    => env('SMTP_SECURE', 'tls'),
    'smtp_user'      => env('SMTP_USER', ''),
    'smtp_pass'      => env('SMTP_PASS', ''),
    'smtp_from'      => env('SMTP_FROM', 'noreply@braderrealestate.ph'),
    'smtp_from_name' => env('SMTP_FROM_NAME', 'Brader Real Estate'),
    'smtp_timeout'   => env_int('SMTP_TIMEOUT', 15),

    // Google Maps
    'google_maps_api_key' => env('GOOGLE_MAPS_API_KEY', ''),

    // Google Sign-In
    'google_client_id' => env('GOOGLE_CLIENT_ID', ''),
];
