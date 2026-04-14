<?php

declare(strict_types=1);

/**
 * TestHarness — Shared utilities for RBAC and data-consistency tests.
 *
 * Provides:
 *  - HTTP request helpers (GET/POST/PATCH/DELETE with JSON)
 *  - Assertion primitives with rich failure messages
 *  - Multi-role user provisioning (admin, agent, seller, buyer, clerk)
 *  - Seed data creation (properties, payments, reservations)
 *  - Teardown to remove test artefacts
 */

final class TestHarness
{
    private string $baseUrl;
    private int $passed = 0;
    private int $failed = 0;
    /** @var list<string> */
    private array $failures = [];

    /** @var array<string, string> role => bearer token */
    private array $tokens = [];

    /** @var array<string, int> role => user id */
    private array $userIds = [];

    /** @var list<array{resource: string, id: int}> items to clean up */
    private array $cleanupQueue = [];

    /** @var array<string, mixed> seed resource IDs */
    private array $seedIds = [];

    public function __construct(?string $baseUrl = null)
    {
        // Suppress curl_close deprecation noise on PHP 8.5+
        error_reporting(E_ALL & ~E_DEPRECATED);

        $this->baseUrl = rtrim(
            $baseUrl ?? (string) (getenv('API_BASE_URL') ?: 'http://localhost/Activities/real_estate/api'),
            '/'
        );
    }

    /* ─── HTTP helpers ─────────────────────────────────────── */

    /**
     * @param array<string, mixed>|null $jsonBody
     * @return array{status: int, body: array<string, mixed>}
     */
    public function request(
        string $method,
        string $path,
        ?string $token = null,
        ?array $jsonBody = null,
        array $extraHeaders = [],
    ): array {
        $url = $this->baseUrl . '/' . ltrim($path, '/');
        $ch  = curl_init($url);
        if ($ch === false) {
            $this->fail('CURL', 'Unable to initialize cURL for ' . $url);
            return ['status' => 0, 'body' => []];
        }

        $headers = ['Accept: application/json'];
        if ($token !== null) {
            $headers[] = 'Authorization: Bearer ' . $token;
        }
        if ($jsonBody !== null) {
            $headers[] = 'Content-Type: application/json';
        }
        $headers = array_merge($headers, $extraHeaders);

        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_TIMEOUT        => 15,
        ];
        if ($jsonBody !== null) {
            $opts[CURLOPT_POSTFIELDS] = json_encode($jsonBody, JSON_THROW_ON_ERROR);
        }
        curl_setopt_array($ch, $opts);

        $raw    = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);
            $this->fail('CURL', "Request failed ({$method} {$path}): {$err}");
            return ['status' => 0, 'body' => []];
        }
        curl_close($ch);

        $json = json_decode((string) $raw, true);
        if (!is_array($json)) {
            $this->fail('PARSE', "Non-JSON from {$method} {$path} (HTTP {$status})");
            return ['status' => $status, 'body' => []];
        }

        return ['status' => $status, 'body' => $json];
    }

    public function get(string $path, ?string $token = null): array
    {
        return $this->request('GET', $path, $token);
    }

    public function post(string $path, ?string $token = null, ?array $body = null): array
    {
        return $this->request('POST', $path, $token, $body);
    }

    public function patch(string $path, ?string $token = null, ?array $body = null): array
    {
        return $this->request('PATCH', $path, $token, $body);
    }

    public function delete(string $path, ?string $token = null): array
    {
        return $this->request('DELETE', $path, $token);
    }

    /* ─── Assertions ───────────────────────────────────────── */

    public function assertStatus(string $label, array $response, int $expected): bool
    {
        if ($response['status'] === $expected) {
            $this->pass($label);
            return true;
        }
        $errorInfo = $response['body']['error']['message'] ?? 'no error message';
        $this->fail($label, "expected HTTP {$expected}, got {$response['status']} ({$errorInfo})");
        return false;
    }

    public function assertStatusIn(string $label, array $response, array $allowed): bool
    {
        if (in_array($response['status'], $allowed, true)) {
            $this->pass($label);
            return true;
        }
        $list = implode('|', $allowed);
        $this->fail($label, "expected HTTP [{$list}], got {$response['status']}");
        return false;
    }

    public function assertBodyKey(string $label, array $response, string $key, mixed $expected): bool
    {
        $value = $this->dot($response['body'], $key);
        if ($value === $expected) {
            $this->pass($label);
            return true;
        }
        $actual = var_export($value, true);
        $want   = var_export($expected, true);
        $this->fail($label, "body.{$key} = {$actual}, expected {$want}");
        return false;
    }

    public function assertBodyKeyExists(string $label, array $response, string $key): bool
    {
        if ($this->dot($response['body'], $key) !== null) {
            $this->pass($label);
            return true;
        }
        $this->fail($label, "body.{$key} is missing");
        return false;
    }

    public function assertNotContainsRole(string $label, array $users, string $forbiddenRole): bool
    {
        foreach ($users as $u) {
            if (($u['role'] ?? '') === $forbiddenRole) {
                $this->fail($label, "found forbidden role '{$forbiddenRole}' in result set");
                return false;
            }
        }
        $this->pass($label);
        return true;
    }

    public function assertTrue(string $label, bool $condition, string $failMsg = 'condition is false'): bool
    {
        if ($condition) {
            $this->pass($label);
            return true;
        }
        $this->fail($label, $failMsg);
        return false;
    }

    /* ─── Provisioning ─────────────────────────────────────── */

    /**
     * Clear rate limit records via direct DB connection.
     * Call before provisioning when running many registrations.
     */
    public function clearRateLimits(): void
    {
        $dbHost = getenv('DB_HOST') ?: '127.0.0.1';
        $dbPort = (int) (getenv('DB_PORT') ?: 3306);
        $dbName = getenv('DB_NAME') ?: 'real_estate_db';
        $dbUser = getenv('DB_USER') ?: 'root';
        $dbPass = getenv('DB_PASS') ?: '';

        $conn = @new \mysqli($dbHost, $dbUser, $dbPass, $dbName, $dbPort);
        if ($conn->connect_error) {
            fwrite(STDOUT, "[WARN] Could not clear rate limits: {$conn->connect_error}\n");
            return;
        }
        $conn->query('DELETE FROM rate_limits');
        $conn->close();
    }

    /**
     * Register and authenticate all 5 roles.
     * Admin credentials come from env vars; others are freshly registered.
     */
    public function provisionUsers(): void
    {
        $adminEmail = (string) (getenv('TEST_ADMIN_EMAIL') ?: '');
        $adminPass  = (string) (getenv('TEST_ADMIN_PASSWORD') ?: '');

        if ($adminEmail === '' || $adminPass === '') {
            $this->fail('SETUP', 'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars required');
            $this->printSummary();
            exit(1);
        }

        // Login admin
        $this->tokens['admin'] = $this->loginUser($adminEmail, $adminPass, 'admin');

        // Decode admin user ID from /auth.php (me action)
        $me = $this->post('auth.php', $this->tokens['admin'], ['action' => 'me']);
        $this->userIds['admin'] = (int) ($me['body']['data']['user']['id'] ?? $me['body']['data']['id'] ?? 0);

        // Register test users for each non-admin role
        $suffix = bin2hex(random_bytes(4));
        foreach (['agent', 'seller', 'buyer', 'clerk'] as $role) {
            $email = "test_{$role}_{$suffix}@estateflow-test.local";
            $phone = '09' . str_pad((string) rand(100000000, 999999999), 9, '0');

            $reg = $this->post('auth.php', null, [
                'action'    => 'register',
                'firstName' => "Test",
                'lastName'  => ucfirst($role),
                'email'      => $email,
                'phone'      => $phone,
                'password'   => 'TestPass123!',
                'role'       => $role,
            ]);

            if ($reg['status'] !== 200 && $reg['status'] !== 201) {
                $msg = $reg['body']['error']['message'] ?? json_encode($reg['body']);
                $this->fail('SETUP', "Failed to register {$role}: {$msg}");
                continue;
            }

            $this->tokens[$role] = $this->extractToken($reg, $role);
            $this->userIds[$role] = (int) ($reg['body']['data']['user']['id'] ?? $reg['body']['data']['id'] ?? 0);
            $this->cleanupQueue[] = ['resource' => 'user', 'id' => $this->userIds[$role]];
        }
    }

    /**
     * Seed a minimal approved property owned by the seller.
     */
    public function seedProperty(): int
    {
        // Verify seller first (admin verifies)
        if (isset($this->userIds['seller']) && $this->userIds['seller'] > 0) {
            $this->patch(
                'users.php?id=' . $this->userIds['seller'],
                $this->tokens['admin'],
                ['verificationAction' => 'verify', 'verification_notes' => 'Test harness auto-verify']
            );
        }

        $prop = $this->post('properties.php', $this->tokens['seller'], [
            'title'        => 'Test Property ' . bin2hex(random_bytes(3)),
            'description'  => 'Automated test listing',
            'price'        => 5000000,
            'propertyType' => 'house',
            'beds'         => 3,
            'baths'        => 2,
            'sqm'          => 120,
            'address'      => '123 Test Street',
            'city'         => 'Manila',
            'province'     => 'Metro Manila',
        ]);

        $propId = (int) ($prop['body']['data']['id'] ?? $prop['body']['property']['id'] ?? 0);

        // Admin approves
        if ($propId > 0) {
            $this->patch(
                "properties.php?id={$propId}&action=approve",
                $this->tokens['admin']
            );
        }

        $this->seedIds['property'] = $propId;
        $this->cleanupQueue[] = ['resource' => 'property', 'id' => $propId];
        return $propId;
    }

    /**
     * Seed a pending property for rejection/unapproved-access tests.
     */
    public function seedPendingProperty(): int
    {
        $prop = $this->post('properties.php', $this->tokens['seller'], [
            'title'        => 'Pending Property ' . bin2hex(random_bytes(3)),
            'description'  => 'Should not be publicly visible',
            'price'        => 3000000,
            'propertyType' => 'condo',
            'beds'         => 1,
            'baths'        => 1,
            'sqm'          => 45,
            'address'      => '456 Hidden Ave',
            'city'         => 'Quezon City',
            'province'     => 'Metro Manila',
        ]);
        $id = (int) ($prop['body']['data']['id'] ?? $prop['body']['property']['id'] ?? 0);
        $this->seedIds['pending_property'] = $id;
        $this->cleanupQueue[] = ['resource' => 'property', 'id' => $id];
        return $id;
    }

    /**
     * Seed a reservation by the buyer on the approved property.
     */
    public function seedReservation(int $propertyId): int
    {
        $res = $this->post('reservations.php', $this->tokens['buyer'], [
            'propertyId' => $propertyId,
            'days'       => 7,
            'notes'      => 'Test reservation',
        ]);
        $id = (int) ($res['body']['data']['id'] ?? $res['body']['reservation']['id'] ?? 0);
        $this->seedIds['reservation'] = $id;
        $this->cleanupQueue[] = ['resource' => 'reservation', 'id' => $id];
        return $id;
    }

    /**
     * Seed a payment by the buyer.
     */
    public function seedPayment(int $propertyId): int
    {
        $pay = $this->post('payments.php', $this->tokens['buyer'], [
            'propertyId'    => $propertyId,
            'amount'        => 50000,
            'paymentMethod' => 'gcash',
            'paymentType'   => 'reservation',
        ]);
        $id = (int) ($pay['body']['data']['id'] ?? $pay['body']['payment']['id'] ?? 0);
        $this->seedIds['payment'] = $id;
        $this->cleanupQueue[] = ['resource' => 'payment', 'id' => $id];
        return $id;
    }

    /**
     * Seed a dispute filed by the buyer.
     */
    public function seedDispute(int $propertyId): int
    {
        $dis = $this->post('disputes.php', $this->tokens['buyer'], [
            'resourceType' => 'property',
            'resourceId'   => $propertyId,
            'reason'       => 'Test dispute',
            'description'  => 'Automated test dispute for permission testing',
        ]);
        $id = (int) ($dis['body']['data']['id'] ?? $dis['body']['dispute']['id'] ?? 0);
        $this->seedIds['dispute'] = $id;
        $this->cleanupQueue[] = ['resource' => 'dispute', 'id' => $id];
        return $id;
    }

    /* ─── Accessors ────────────────────────────────────────── */

    public function token(string $role): string
    {
        return $this->tokens[$role] ?? '';
    }

    public function userId(string $role): int
    {
        return $this->userIds[$role] ?? 0;
    }

    public function seed(string $key): int
    {
        return (int) ($this->seedIds[$key] ?? 0);
    }

    /* ─── Teardown ─────────────────────────────────────────── */

    public function teardown(): void
    {
        fwrite(STDOUT, "\n--- Teardown ---\n");
        // Reverse order to respect FK constraints
        foreach (array_reverse($this->cleanupQueue) as $item) {
            $resource = $item['resource'];
            $id       = $item['id'];
            if ($id <= 0) {
                continue;
            }

            $endpoint = match ($resource) {
                'user'        => "users.php?id={$id}",
                'property'    => "properties.php?id={$id}",
                'reservation' => "reservations.php?id={$id}",
                'payment'     => "payments.php?id={$id}",
                'dispute'     => "disputes.php?id={$id}",
                default       => null,
            };

            if ($endpoint !== null) {
                $r = $this->delete($endpoint, $this->tokens['admin'] ?? '');
                $status = $r['status'] === 200 || $r['status'] === 204 ? 'OK' : "HTTP {$r['status']}";
                fwrite(STDOUT, "  Cleanup {$resource} #{$id}: {$status}\n");
            }
        }
    }

    /* ─── Reporting ────────────────────────────────────────── */

    public function pass(string $label): void
    {
        $this->passed++;
        fwrite(STDOUT, "[PASS] {$label}\n");
    }

    public function fail(string $label, string $detail = ''): void
    {
        $this->failed++;
        $msg = "[FAIL] {$label}" . ($detail !== '' ? " — {$detail}" : '');
        $this->failures[] = $msg;
        fwrite(STDERR, "{$msg}\n");
    }

    public function skip(string $label, string $reason = ''): void
    {
        fwrite(STDOUT, "[SKIP] {$label}" . ($reason !== '' ? " — {$reason}" : '') . "\n");
    }

    public function printSummary(): int
    {
        $total = $this->passed + $this->failed;
        fwrite(STDOUT, "\n========================================\n");
        fwrite(STDOUT, " Results: {$this->passed}/{$total} passed");
        if ($this->failed > 0) {
            fwrite(STDOUT, " ({$this->failed} FAILED)");
        }
        fwrite(STDOUT, "\n========================================\n");

        if (count($this->failures) > 0) {
            fwrite(STDERR, "\nFailure details:\n");
            foreach ($this->failures as $f) {
                fwrite(STDERR, "  {$f}\n");
            }
        }

        return $this->failed > 0 ? 1 : 0;
    }

    /* ─── Internal ─────────────────────────────────────────── */

    private function loginUser(string $email, string $password, string $label): string
    {
        $res = $this->post('auth.php', null, [
            'action'   => 'login',
            'email'    => $email,
            'password' => $password,
        ]);
        if ($res['status'] !== 200) {
            $msg = $res['body']['error']['message'] ?? 'unknown error';
            $this->fail('SETUP', "Login failed for {$label}: {$msg}");
            return '';
        }
        return $this->extractToken($res, $label);
    }

    private function extractToken(array $response, string $label): string
    {
        $token = $response['body']['data']['token']
            ?? $response['body']['token']
            ?? $response['body']['session']['token']
            ?? '';
        if ($token === '') {
            $this->fail('SETUP', "No token in response for {$label}");
        }
        return (string) $token;
    }

    /** Dot-notation accessor for nested arrays. */
    private function dot(array $arr, string $key): mixed
    {
        $parts = explode('.', $key);
        $current = $arr;
        foreach ($parts as $p) {
            if (!is_array($current) || !array_key_exists($p, $current)) {
                return null;
            }
            $current = $current[$p];
        }
        return $current;
    }
}
