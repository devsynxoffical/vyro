<?php
declare(strict_types=1);

/**
 * Sessions, permissions and two-step login.
 *
 * - The session cookie is HttpOnly + SameSite=Lax; only its hash is stored.
 * - Every state-changing request must carry the session's CSRF token.
 * - Admin accounts with two-step login enabled are treated as signed out
 *   until the code has been verified for that session.
 */

const SESSION_COOKIE = 'vyro_sid';
const SESSION_HOURS = 12;

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function set_session_cookie(string $value, int $expires): void
{
    setcookie(SESSION_COOKIE, $value, [
        'expires' => $expires,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/** Starts a session for the user and returns its CSRF token. */
function session_start_for(array $user): string
{
    $sid = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(32));
    q('DELETE FROM sessions WHERE expires_at < ?', [now()]);
    q(
        'INSERT INTO sessions (id_hash, user_id, csrf, mfa_ok, created_at, expires_at) VALUES (?,?,?,?,?,?)',
        [hash('sha256', $sid), $user['id'], $csrf, $user['totp_enabled'] ? 0 : 1, now(), now(SESSION_HOURS * 3600)],
    );
    set_session_cookie($sid, time() + SESSION_HOURS * 3600);
    return $csrf;
}

function session_end(): void
{
    $sid = $_COOKIE[SESSION_COOKIE] ?? '';
    if ($sid !== '') {
        q('DELETE FROM sessions WHERE id_hash = ?', [hash('sha256', $sid)]);
    }
    set_session_cookie('', time() - 3600);
}

/**
 * The current session joined with its user, or null. Does not check the
 * second step; use need_user() for that.
 */
function session_row(): ?array
{
    static $cached = false;
    if ($cached !== false) {
        return $cached;
    }
    $sid = $_COOKIE[SESSION_COOKIE] ?? '';
    if (!is_string($sid) || !preg_match('/^[0-9a-f]{64}$/', $sid)) {
        return $cached = null;
    }
    return $cached = row(
        'SELECT s.id_hash, s.csrf, s.mfa_ok, u.id, u.email, u.role, u.company_id, u.full_name, u.totp_enabled, u.totp_secret
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.id_hash = ? AND s.expires_at > ?',
        [hash('sha256', $sid), now()],
    );
}

function check_csrf(array $session): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        return;
    }
    $given = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!is_string($given) || !hash_equals($session['csrf'], $given)) {
        fail(403, 'Your session has expired. Please reload the page.');
    }
}

/** Signed-in user who has passed the second step (if they have one). */
function need_user(): array
{
    $s = session_row();
    if (!$s) {
        fail(401, 'Not signed in');
    }
    if ($s['totp_enabled'] && !$s['mfa_ok']) {
        fail(401, 'Two-step verification required');
    }
    check_csrf($s);
    return $s;
}

function need_admin(): array
{
    $u = need_user();
    if ($u['role'] !== 'admin') {
        fail(403, 'Admins only');
    }
    return $u;
}

/**
 * The company a request may act on: a client is locked to their own; an admin
 * names one explicitly.
 */
function company_scope(array $user, mixed $requested = null): string
{
    if ($user['role'] === 'admin') {
        return need_uuid($requested, 'company');
    }
    if (!$user['company_id']) {
        fail(403, 'No access');
    }
    return $user['company_id'];
}

/** Refuses unless the row belongs to the company in scope. */
function owned(?array $row, string $companyId, string $what): array
{
    if (!$row || $row['company_id'] !== $companyId) {
        fail(404, "$what not found");
    }
    return $row;
}

function public_user(array $s): array
{
    return [
        'id' => $s['id'],
        'email' => $s['email'],
        'role' => $s['role'],
        'company_id' => $s['company_id'],
        'full_name' => $s['full_name'],
    ];
}

function check_password_rules(string $password): void
{
    if (strlen($password) < 10) {
        fail(400, 'Password must be at least 10 characters');
    }
    if (strlen($password) > 200) {
        fail(400, 'Password is too long');
    }
}

function random_token(): string
{
    return bin2hex(random_bytes(32));
}

/* ------------------------------------------------------------------ TOTP */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function totp_new_secret(): string
{
    $out = '';
    foreach (str_split(random_bytes(20)) as $byte) {
        $out .= B32[ord($byte) & 31];
    }
    return $out;
}

function b32_decode(string $s): string
{
    $bits = '';
    foreach (str_split(strtoupper($s)) as $c) {
        $i = strpos(B32, $c);
        if ($i === false) {
            continue;
        }
        $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bits, 8) as $chunk) {
        if (strlen($chunk) === 8) {
            $out .= chr(bindec($chunk));
        }
    }
    return $out;
}

function totp_code(string $secret, int $counter): string
{
    $hash = hash_hmac('sha1', pack('J', $counter), b32_decode($secret), true);
    $offset = ord($hash[19]) & 0x0f;
    $value = unpack('N', substr($hash, $offset, 4))[1] & 0x7fffffff;
    return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
}

/** Accepts the current 30-second code and one step either side (clock drift). */
function totp_verify(string $secret, string $code): bool
{
    $code = preg_replace('/\D/', '', $code) ?? '';
    if (strlen($code) !== 6) {
        return false;
    }
    $counter = intdiv(time(), 30);
    foreach ([0, -1, 1] as $drift) {
        if (hash_equals(totp_code($secret, $counter + $drift), $code)) {
            return true;
        }
    }
    return false;
}
