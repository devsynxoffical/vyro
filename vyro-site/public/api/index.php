<?php
declare(strict_types=1);

/**
 * VYRO API front controller. Every request to /api/... lands here.
 */

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/ompay.php';
require __DIR__ . '/lib/billing.php';
require __DIR__ . '/lib/migrate.php';
require __DIR__ . '/lib/routes.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function send(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Shared-secret check for the scheduled jobs (never a browser session). */
function need_cron_secret(): void
{
    $secret = (string) cfg('cron_secret', '');
    $given = (string) ($_SERVER['HTTP_X_CRON_SECRET'] ?? '');
    if ($secret === '' || !hash_equals($secret, $given)) {
        fail(403, 'Forbidden');
    }
}

/** Emails notifications that have not been sent yet. */
function send_outbox(): int
{
    $admins = array_filter(array_map('trim', explode(',', (string) cfg('admin_emails', ''))));
    $sent = 0;
    $pending = rows('SELECT * FROM notifications WHERE emailed_at IS NULL AND created_at > ? ORDER BY created_at LIMIT 50', [now(-3 * 86400)]);
    foreach ($pending as $n) {
        if ($n['audience'] === 'admin') {
            $to = $admins;
        } else {
            $to = array_column(rows(
                "SELECT contact_email AS e FROM companies WHERE id = ? AND contact_email IS NOT NULL
                 UNION SELECT email FROM users WHERE company_id = ? AND role = 'client'",
                [$n['company_id'], $n['company_id']],
            ), 'e');
        }
        $ok = true;
        foreach (array_unique($to) as $address) {
            $ok = send_mail($address, 'VYRO: ' . $n['title'], $n['title'] . ($n['body'] ? "\n\n" . $n['body'] : '') . "\n\n" . app_url() . '/login') && $ok;
        }
        if ($ok) {
            q('UPDATE notifications SET emailed_at = ? WHERE id = ?', [now(), $n['id']]);
            $sent++;
        }
    }
    return $sent;
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $uri = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $pos = strpos($uri, '/api/');
    $path = trim($pos === false ? '' : substr($uri, $pos + 5), '/');

    /* Public: the licence check used by the loader on client websites. */
    if ($path === 'widget-status') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, OPTIONS');
        header('Vary: Origin');
        if ($method === 'OPTIONS') {
            send(['ok' => true]);
        }
        $key = (string) ($_GET['key'] ?? '');
        if (!preg_match('/^vyro_pk_[0-9a-f]{32}$/', $key)) {
            send(['active' => false, 'reason' => 'unknown_key']);
        }
        // The website comes from the browser's own headers, not from a
        // parameter, so a page cannot claim to be another domain.
        $site = (string) ($_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '');
        try {
            $status = widget_status($key, $site);
        } catch (HttpError $e) {
            throw $e;
        } catch (Throwable $e) {
            error_log('widget-status: ' . $e->getMessage());
            // If our own service has a problem, do not switch paying clients off.
            send(['active' => true, 'degraded' => true, 'products' => []]);
        }
        // Short cache: cheap for busy shops, and a cancelled client is off within minutes.
        header('Cache-Control: public, max-age=300');
        send($status);
    }

    /* Scheduled jobs and setup, protected by the cron secret. */
    if ($path === 'cron/migrate') {
        need_cron_secret();
        send(['applied' => migrate()]);
    }
    if ($path === 'cron/billing-run') {
        need_cron_secret();
        $summary = run_billing(gateway());
        try {
            $summary['emails'] = send_outbox();
        } catch (Throwable $e) {
            $summary['errors'][] = 'emails: ' . $e->getMessage();
        }
        if ($summary['errors']) {
            error_log('billing-run: ' . implode(' | ', $summary['errors']));
        }
        send($summary, $summary['errors'] ? 207 : 200);
    }
    if ($path === 'setup/admin') {
        need_cron_secret();
        $email = strtolower(in_str('email', 200));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            fail(400, 'A valid email is required');
        }
        $id = val('SELECT id FROM users WHERE email = ?', [$email]);
        if (!$id) {
            $id = uuid();
            // The account starts with a random password nobody knows; the link sets the real one.
            q("INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?,?,?,'admin',?)",
                [$id, $email, password_hash(random_token(), PASSWORD_DEFAULT), now()]);
        } elseif (val('SELECT role FROM users WHERE id = ?', [$id]) !== 'admin') {
            fail(409, 'That email belongs to a client account.');
        }
        send(['set_password_url' => password_reset_link((string) $id, 24)]);
    }

    $handler = routes()["$method $path"] ?? null;
    if (!$handler) {
        fail(404, 'Not found');
    }
    send($handler());
} catch (HttpError $e) {
    send(['error' => $e->getMessage()], $e->status);
} catch (Throwable $e) {
    // Never leak internals (SQL, file paths, gateway messages) to the browser.
    error_log('api: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    send(['error' => 'Something went wrong. Please try again.'], 500);
}
