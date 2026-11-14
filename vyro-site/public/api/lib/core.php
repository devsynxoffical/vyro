<?php
declare(strict_types=1);

/**
 * Core helpers: configuration, database, transactions, HTTP in/out.
 *
 * Unlike the previous Postgres backend, MySQL has no row-level security, so
 * every permission check lives in PHP (see auth.php) and every query that
 * touches client data is scoped by company id explicitly.
 */

final class HttpError extends RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}

function fail(int $status, string $message): never
{
    throw new HttpError($status, $message);
}

/** Settings from config.php (written at deploy time from GitHub secrets). */
function cfg(string $key, mixed $default = null): mixed
{
    static $config = null;
    if ($config === null) {
        $file = getenv('VYRO_CONFIG') ?: __DIR__ . '/../config.php';
        if (!is_file($file)) {
            fail(503, 'The server is not configured yet.');
        }
        $config = require $file;
    }
    return $config[$key] ?? $default;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', cfg('db_host', 'localhost'), cfg('db_name'));
        $pdo = new PDO($dsn, (string) cfg('db_user'), (string) cfg('db_password'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false, // real prepared statements: no SQL injection through values
        ]);
        $pdo->exec("SET time_zone = '+00:00', sql_mode = CONCAT(@@sql_mode, ',STRICT_ALL_TABLES')");
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st;
}

function row(string $sql, array $params = []): ?array
{
    $r = q($sql, $params)->fetch();
    return $r === false ? null : $r;
}

function rows(string $sql, array $params = []): array
{
    return q($sql, $params)->fetchAll();
}

function val(string $sql, array $params = []): mixed
{
    $v = q($sql, $params)->fetchColumn();
    return $v === false ? null : $v;
}

/** Runs $fn in one transaction. Nested calls join the outer transaction. */
function tx(callable $fn): mixed
{
    static $depth = 0;
    if ($depth === 0) {
        db()->beginTransaction();
    }
    $depth++;
    try {
        $result = $fn();
        $depth--;
        if ($depth === 0) {
            db()->commit();
        }
        return $result;
    } catch (Throwable $e) {
        $depth--;
        if ($depth === 0 && db()->inTransaction()) {
            db()->rollBack();
        }
        throw $e;
    }
}

function uuid(): string
{
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
    $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

function is_uuid(mixed $v): bool
{
    return is_string($v) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $v) === 1;
}

/** Current time in UTC, as stored in the database. */
function now(int $offsetSeconds = 0): string
{
    return gmdate('Y-m-d H:i:s', time() + $offsetSeconds);
}

/** Today's date where billing happens (Oman), not the server's time zone. */
function today(): string
{
    return (new DateTimeImmutable('now', new DateTimeZone((string) cfg('timezone', 'Asia/Muscat'))))->format('Y-m-d');
}

/** Database UTC datetime to an ISO string the browser can parse. */
function iso(?string $dt): ?string
{
    return $dt === null ? null : str_replace(' ', 'T', $dt) . 'Z';
}

function app_url(): string
{
    return rtrim((string) cfg('app_url', ''), '/');
}

/* ------------------------------------------------------------------ input */

function input(): array
{
    static $body = null;
    if ($body === null) {
        $raw = file_get_contents('php://input') ?: '';
        $json = $raw !== '' ? json_decode($raw, true) : null;
        $body = is_array($json) ? $json : $_POST;
    }
    return $body;
}

/** A trimmed string from the request, cut to a maximum length. */
function str(mixed $v, int $max = 300): string
{
    if (!is_string($v) && !is_numeric($v)) {
        return '';
    }
    return mb_substr(trim((string) $v), 0, $max);
}

function in_str(string $key, int $max = 300): string
{
    return str(input()[$key] ?? '', $max);
}

function num(mixed $v, string $name, float $min = 0): float
{
    if (!is_numeric($v) || (float) $v < $min || !is_finite((float) $v)) {
        fail(400, "$name must be a number of at least $min");
    }
    return round((float) $v, 3);
}

function need_uuid(mixed $v, string $what = 'id'): string
{
    if (!is_uuid($v)) {
        fail(400, "Invalid $what");
    }
    return $v;
}

function client_ip(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Fixed-window rate limit. Returns false when the caller is over the limit.
 */
function rate_ok(string $bucket, int $max, int $windowSeconds): bool
{
    $bucket = substr($bucket, 0, 120);
    return tx(function () use ($bucket, $max, $windowSeconds) {
        $r = row('SELECT hits, window_start FROM rate_limits WHERE bucket = ? FOR UPDATE', [$bucket]);
        if (!$r || strtotime($r['window_start'] . ' UTC') < time() - $windowSeconds) {
            q('REPLACE INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, ?)', [$bucket, now()]);
            return true;
        }
        if ((int) $r['hits'] >= $max) {
            return false;
        }
        q('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$bucket]);
        return true;
    });
}

function rate_clear(string $bucket): void
{
    q('DELETE FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 120)]);
}

/** Adds a notification; these also feed the email outbox. */
function notify(string $audience, ?string $companyId, string $kind, string $title, ?string $body = null): void
{
    q(
        'INSERT INTO notifications (id, audience, company_id, kind, title, body, created_at) VALUES (?,?,?,?,?,?,?)',
        [uuid(), $audience, $companyId, $kind, mb_substr($title, 0, 255), $body === null ? null : mb_substr($body, 0, 600), now()],
    );
}

function money_str(mixed $amount, string $currency = 'OMR'): string
{
    return number_format((float) $amount, 3, '.', '') . ' ' . $currency;
}

function nice_date(?string $date): string
{
    return $date ? date('j M Y', strtotime($date)) : '';
}
