<?php
declare(strict_types=1);

/**
 * API endpoints. Each handler returns the array to send as JSON.
 * Permission rule of thumb: need_user() + company_scope() for client data,
 * need_admin() for anything that changes prices, status or other companies.
 */

/* ------------------------------------------------------------ serializers */

function fmt_company(array $c, bool $admin = false): array
{
    $out = [
        'id' => $c['id'], 'name' => $c['name'], 'store_name' => $c['store_name'], 'website' => $c['website'],
        'logo_path' => $c['logo_path'], 'contact_name' => $c['contact_name'], 'contact_email' => $c['contact_email'],
        'contact_phone' => $c['contact_phone'], 'address' => $c['address'], 'created_at' => iso($c['created_at']),
    ];
    if ($admin) {
        $out['notes'] = $c['notes'] ?? '';
    }
    return $out;
}

function fmt_plan(?array $p): ?array
{
    if (!$p) {
        return null;
    }
    return [
        'id' => $p['id'], 'company_id' => $p['company_id'], 'name' => $p['name'], 'currency' => $p['currency'],
        'setup_fee' => (float) $p['setup_fee'], 'recurring_fee' => (float) $p['recurring_fee'],
        'billing_interval' => $p['billing_interval'], 'product_limit' => (int) $p['product_limit'],
        'billing_start_date' => $p['billing_start_date'],
        'contract_months' => $p['contract_months'] === null ? null : (int) $p['contract_months'],
        'cancellation_terms' => $p['cancellation_terms'],
    ];
}

function fmt_sub(?array $s): ?array
{
    if (!$s) {
        return null;
    }
    return [
        'id' => $s['id'], 'company_id' => $s['company_id'], 'status' => $s['status'],
        'setup_paid_at' => iso($s['setup_paid_at']), 'current_period_start' => $s['current_period_start'],
        'current_period_end' => $s['current_period_end'], 'next_billing_date' => $s['next_billing_date'],
        'cancel_at_period_end' => (bool) $s['cancel_at_period_end'], 'grace_until' => iso($s['grace_until']),
        'contract_end' => $s['contract_end'], 'widget_override' => $s['widget_override'],
        // Computed on the server so the browser never has to guess.
        'live' => subscription_is_live($s),
    ];
}

function fmt_invoice(array $i, ?array $items = null): array
{
    $out = [
        'id' => $i['id'], 'number' => $i['number'], 'company_id' => $i['company_id'], 'kind' => $i['kind'],
        'status' => $i['status'], 'currency' => $i['currency'], 'total' => (float) $i['total'],
        'period_start' => $i['period_start'], 'period_end' => $i['period_end'], 'due_date' => $i['due_date'],
        'paid_at' => iso($i['paid_at']), 'attempts' => (int) $i['attempts'], 'created_at' => iso($i['created_at']),
    ];
    if ($items !== null) {
        $out['invoice_items'] = array_map(
            fn ($it) => ['id' => $it['id'], 'description' => $it['description'], 'amount' => (float) $it['amount']],
            $items,
        );
    }
    return $out;
}

/** Invoices of one company with their lines, newest first. */
function invoices_with_items(string $companyId, bool $includeVoid = false): array
{
    $invoices = rows(
        'SELECT * FROM invoices WHERE company_id = ?' . ($includeVoid ? '' : " AND status <> 'void'") . ' ORDER BY created_at DESC, number DESC',
        [$companyId],
    );
    $items = rows(
        'SELECT it.* FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id WHERE i.company_id = ? ORDER BY it.created_at',
        [$companyId],
    );
    $by = [];
    foreach ($items as $it) {
        $by[$it['invoice_id']][] = $it;
    }
    return array_map(fn ($i) => fmt_invoice($i, $by[$i['id']] ?? []), $invoices);
}

/** The saved card without its token: the token never leaves the server. */
function fmt_card(?array $m): ?array
{
    return $m ? ['id' => $m['id'], 'brand' => $m['brand'], 'masked_pan' => $m['masked_pan'], 'is_default' => true, 'revoked_at' => null] : null;
}

function default_card(string $companyId): ?array
{
    return row('SELECT id, brand, masked_pan FROM payment_methods WHERE company_id = ? AND is_default = 1 AND revoked_at IS NULL', [$companyId]);
}

function fmt_notice(array $n): array
{
    return [
        'id' => $n['id'], 'company_id' => $n['company_id'], 'kind' => $n['kind'], 'title' => $n['title'],
        'body' => $n['body'], 'read_at' => iso($n['read_at']), 'created_at' => iso($n['created_at']),
        'company_name' => $n['company_name'] ?? null,
    ];
}

function fmt_product(array $p): array
{
    return [
        'id' => $p['id'], 'type' => $p['type'], 'name' => $p['name'], 'sku' => $p['sku'], 'price' => $p['price'],
        'image_path' => $p['image_path'], 'options' => json_decode($p['options'], true) ?: new stdClass(),
        'active' => (bool) $p['active'],
    ];
}

/* ------------------------------------------------------------------ uploads */

function upload_root(): string
{
    return rtrim((string) cfg('upload_dir', __DIR__ . '/../../uploads'), '/');
}

/**
 * Stores an uploaded image under uploads/<area>/<company>/ with a random name
 * and an extension chosen from its real content, never from the file name.
 */
function store_image(string $field, string $area, string $companyId, array $allowed, int $maxBytes): string
{
    $f = $_FILES[$field] ?? null;
    if (!$f || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file_or_test($f['tmp_name'])) {
        fail(400, 'Choose an image to upload.');
    }
    if ($f['size'] > $maxBytes) {
        fail(400, 'The image is too large (max ' . round($maxBytes / 1048576, 1) . ' MB).');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($f['tmp_name']);
    if (!isset($allowed[$mime]) || @getimagesize($f['tmp_name']) === false) {
        fail(400, 'Use one of these image types: ' . implode(', ', array_map('strtoupper', array_unique(array_values($allowed)))) . '.');
    }
    $dir = upload_root() . "/$area/$companyId";
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {
        fail(500, 'Could not store the image.');
    }
    $name = bin2hex(random_bytes(12)) . '.' . $allowed[$mime];
    $ok = PHP_SAPI === 'cli' || getenv('VYRO_TEST') ? rename($f['tmp_name'], "$dir/$name") : move_uploaded_file($f['tmp_name'], "$dir/$name");
    if (!$ok) {
        fail(500, 'Could not store the image.');
    }
    @chmod("$dir/$name", 0644);
    return "$area/$companyId/$name";
}

function is_uploaded_file_or_test(string $path): bool
{
    return is_uploaded_file($path) || (getenv('VYRO_TEST') && is_file($path));
}

/** Deletes a stored upload; refuses any path outside the upload folder. */
function delete_upload(?string $path): void
{
    if (!$path || !preg_match('#^(logos|products)/[0-9a-f-]{36}/[0-9a-f]{24}\.(png|jpg|webp)$#', $path)) {
        return;
    }
    @unlink(upload_root() . '/' . $path);
}

/* ---------------------------------------------------------------- handlers */

function send_mail(string $to, string $subject, string $text): bool
{
    $from = (string) cfg('email_from', 'VYRO <no-reply@' . (parse_url(app_url(), PHP_URL_HOST) ?: 'localhost') . '>');
    if (getenv('VYRO_TEST')) {
        file_put_contents(sys_get_temp_dir() . '/vyro-mail.log', json_encode(compact('to', 'subject', 'text')) . "\n", FILE_APPEND);
        return true;
    }
    $headers = 'From: ' . preg_replace('/[\r\n]+/', ' ', $from) . "\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, $headers);
}

function create_invite(string $companyId, string $email, ?string $by): string
{
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail(400, 'A valid client email is required');
    }
    $token = random_token();
    q(
        'INSERT INTO invites (id, company_id, email, token_hash, expires_at, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
        [uuid(), $companyId, strtolower($email), hash('sha256', $token), now(7 * 86400), $by, now()],
    );
    return app_url() . '/register?invite=' . $token;
}

function valid_invite(string $token): array
{
    if (!preg_match('/^[0-9a-f]{64}$/', $token)) {
        fail(400, 'This registration link is not valid');
    }
    $inv = row(
        'SELECT i.id, i.email, i.company_id, c.name AS company_name, c.store_name, c.website, c.contact_phone, c.address
           FROM invites i JOIN companies c ON c.id = i.company_id
          WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?',
        [hash('sha256', $token), now()],
    );
    if (!$inv) {
        fail(410, 'This registration link has expired or was already used');
    }
    return $inv;
}

function password_reset_link(string $userId, int $hours = 2): string
{
    $token = random_token();
    q('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?,?,?)', [hash('sha256', $token), $userId, now($hours * 3600)]);
    return app_url() . '/login?reset=' . $token;
}

function routes(): array
{
    return [
        /* ---------------------------------------------------------- session */
        'GET me' => function () {
            $s = session_row();
            if (!$s) {
                return ['user' => null];
            }
            $pending = $s['totp_enabled'] && !$s['mfa_ok'];
            return ['user' => $pending ? null : public_user($s), 'mfa_required' => (bool) $pending, 'csrf' => $s['csrf']];
        },

        'POST auth/login' => function () {
            $email = strtolower(in_str('email', 200));
            $password = (string) (input()['password'] ?? '');
            $bucket = 'login:' . hash('sha256', $email . '|' . client_ip());
            // 8 tries per 15 minutes per email + address, and 40 per address overall.
            if (!rate_ok($bucket, 8, 900) || !rate_ok('login-ip:' . client_ip(), 40, 900)) {
                fail(429, 'Too many attempts. Please wait 15 minutes and try again.');
            }
            $u = row('SELECT * FROM users WHERE email = ?', [$email]);
            // Always run a hash check so the response time does not reveal whether the email exists.
            $hash = $u['password_hash'] ?? '$2y$10$s1iN4qYq9SGOJgSX6pzZMesYKwtmRf.5Qd600dcGOaAtbn7//AfYG'; // a real hash of a random string nobody knows
            if (!password_verify($password, $hash) || !$u) {
                fail(401, 'Wrong email or password.');
            }
            rate_clear($bucket);
            if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
                q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
            }
            $csrf = session_start_for($u);
            $pending = (bool) $u['totp_enabled'];
            return ['user' => $pending ? null : public_user($u), 'mfa_required' => $pending, 'csrf' => $csrf];
        },

        'POST auth/mfa' => function () {
            $s = session_row();
            if (!$s) {
                fail(401, 'Not signed in');
            }
            check_csrf($s);
            if (!rate_ok('mfa:' . $s['id'], 6, 600)) {
                fail(429, 'Too many attempts. Please wait 10 minutes.');
            }
            if (!$s['totp_enabled'] || !totp_verify((string) $s['totp_secret'], in_str('code', 12))) {
                fail(401, 'That code is not correct. Try the current code from your app.');
            }
            q('UPDATE sessions SET mfa_ok = 1 WHERE id_hash = ?', [$s['id_hash']]);
            rate_clear('mfa:' . $s['id']);
            return ['user' => public_user($s), 'csrf' => $s['csrf']];
        },

        'POST auth/logout' => function () {
            session_end();
            return ['ok' => true];
        },

        'POST auth/forgot' => function () {
            $email = strtolower(in_str('email', 200));
            if (!rate_ok('forgot:' . client_ip(), 5, 3600)) {
                fail(429, 'Too many requests. Please try again later.');
            }
            $u = row('SELECT id FROM users WHERE email = ?', [$email]);
            if ($u) {
                send_mail($email, 'Reset your VYRO password',
                    "Use this link to choose a new password. It works once and expires in 2 hours:\n\n" . password_reset_link($u['id'])
                    . "\n\nIf you did not ask for this, you can ignore this email.");
            }
            return ['ok' => true]; // same answer whether or not the account exists
        },

        'POST auth/reset' => function () {
            $token = in_str('token', 128);
            $password = (string) (input()['password'] ?? '');
            check_password_rules($password);
            tx(function () use ($token, $password) {
                $r = row('SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? FOR UPDATE',
                    [hash('sha256', $token), now()]);
                if (!$r) {
                    fail(410, 'This link has expired or was already used. Ask for a new one.');
                }
                q('UPDATE password_resets SET used_at = ? WHERE token_hash = ?', [now(), $r['token_hash']]);
                q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $r['user_id']]);
                q('DELETE FROM sessions WHERE user_id = ?', [$r['user_id']]); // sign out everywhere
            });
            return ['ok' => true];
        },

        'POST auth/password' => function () {
            $u = need_user();
            $password = (string) (input()['password'] ?? '');
            check_password_rules($password);
            q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
            q('DELETE FROM sessions WHERE user_id = ? AND id_hash <> ?', [$u['id'], $u['id_hash']]);
            return ['ok' => true];
        },

        'GET auth/mfa/status' => fn () => ['enabled' => (bool) need_user()['totp_enabled']],

        'POST auth/mfa/enroll' => function () {
            $u = need_user();
            if ($u['totp_enabled']) {
                fail(409, 'Two-step login is already on.');
            }
            $secret = totp_new_secret();
            q('UPDATE users SET totp_secret = ? WHERE id = ?', [$secret, $u['id']]);
            return [
                'secret' => $secret,
                'uri' => 'otpauth://totp/' . rawurlencode('VYRO:' . $u['email']) . '?secret=' . $secret . '&issuer=VYRO',
            ];
        },

        'POST auth/mfa/confirm' => function () {
            $u = need_user();
            if (!$u['totp_secret'] || !totp_verify($u['totp_secret'], in_str('code', 12))) {
                fail(400, 'That code is not correct. Try the current code from your app.');
            }
            q('UPDATE users SET totp_enabled = 1 WHERE id = ?', [$u['id']]);
            q('UPDATE sessions SET mfa_ok = 1 WHERE id_hash = ?', [$u['id_hash']]);
            return ['ok' => true];
        },

        /* ----------------------------------------------------- registration */
        'POST register/lookup' => function () {
            $inv = valid_invite(in_str('token', 128));
            unset($inv['id'], $inv['company_id']);
            return $inv;
        },

        'POST register/complete' => function () {
            if (!rate_ok('register:' . client_ip(), 10, 3600)) {
                fail(429, 'Too many attempts. Please try again later.');
            }
            $token = in_str('token', 128);
            $password = (string) (input()['password'] ?? '');
            check_password_rules($password);
            $fullName = in_str('full_name', 150);
            if ($fullName === '') {
                fail(400, 'Your name is required');
            }
            $c = is_array(input()['company'] ?? null) ? input()['company'] : [];
            $email = tx(function () use ($token, $password, $fullName, $c) {
                $inv = valid_invite($token);
                // Claim the invite first: a second submit of the same link finds nothing to update.
                $claimed = q('UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL', [now(), $inv['id']])->rowCount();
                if ($claimed !== 1) {
                    fail(410, 'This registration link has expired or was already used');
                }
                if (val('SELECT 1 FROM users WHERE email = ?', [$inv['email']])) {
                    fail(409, 'An account already exists for this email. Please sign in instead.');
                }
                q(
                    "INSERT INTO users (id, email, password_hash, role, company_id, full_name, created_at) VALUES (?,?,?,'client',?,?,?)",
                    [uuid(), $inv['email'], password_hash($password, PASSWORD_DEFAULT), $inv['company_id'], $fullName, now()],
                );
                $set = fn (string $k, int $max) => str($c[$k] ?? '', $max) ?: null;
                q(
                    'UPDATE companies SET name = COALESCE(?, name), store_name = COALESCE(?, store_name), website = COALESCE(?, website),
                            contact_name = COALESCE(contact_name, ?), contact_email = COALESCE(contact_email, ?),
                            contact_phone = COALESCE(?, contact_phone), address = COALESCE(?, address) WHERE id = ?',
                    [$set('name', 150), $set('store_name', 150), $set('website', 200), $fullName, $inv['email'],
                        $set('contact_phone', 40), $set('address', 400), $inv['company_id']],
                );
                notify('admin', $inv['company_id'], 'registered', 'Client completed registration', $inv['email']);
                return $inv['email'];
            });
            $u = row('SELECT * FROM users WHERE email = ?', [$email]);
            $csrf = session_start_for($u);
            return ['user' => public_user($u), 'csrf' => $csrf];
        },

        /* ----------------------------------------------------------- portal */
        'GET portal' => function () {
            $u = need_user();
            $cid = company_scope($u, $_GET['company_id'] ?? null);
            $company = row('SELECT * FROM companies WHERE id = ?', [$cid]);
            if (!$company) {
                fail(404, 'Account not found');
            }
            return [
                'company' => fmt_company($company),
                'plan' => fmt_plan(row('SELECT * FROM plans WHERE company_id = ?', [$cid])),
                'sub' => fmt_sub(row('SELECT * FROM subscriptions WHERE company_id = ?', [$cid])),
                'invoices' => invoices_with_items($cid),
                'card' => fmt_card(default_card($cid)),
                'widgetKey' => val('SELECT public_key FROM widget_keys WHERE company_id = ?', [$cid]),
                'liveProducts' => (int) val('SELECT COUNT(*) FROM products WHERE company_id = ? AND active = 1', [$cid]),
            ];
        },

        'POST portal/company' => function () {
            $u = need_user();
            $cid = company_scope($u, input()['company_id'] ?? null);
            $name = in_str('name', 150);
            if ($name === '') {
                fail(400, 'Company name is required');
            }
            $email = in_str('contact_email', 200);
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                fail(400, 'Enter a valid contact email');
            }
            q(
                'UPDATE companies SET name = ?, store_name = ?, website = ?, contact_name = ?, contact_email = ?, contact_phone = ?, address = ? WHERE id = ?',
                [$name, in_str('store_name', 150) ?: null, in_str('website', 200) ?: null, in_str('contact_name', 150) ?: null,
                    $email ?: null, in_str('contact_phone', 40) ?: null, in_str('address', 400) ?: null, $cid],
            );
            return ['ok' => true];
        },

        'POST portal/logo' => function () {
            $u = need_user();
            $cid = company_scope($u, $_POST['company_id'] ?? null);
            $path = store_image('file', 'logos', $cid, ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'], 1048576);
            $old = val('SELECT logo_path FROM companies WHERE id = ?', [$cid]);
            q('UPDATE companies SET logo_path = ? WHERE id = ?', [$path, $cid]);
            delete_upload($old);
            return ['logo_path' => $path];
        },

        /* ---------------------------------------------------------- billing */
        'POST billing/pay' => function () {
            $u = need_user();
            $cid = company_scope($u, input()['company_id'] ?? null);
            $inv = owned(row('SELECT * FROM invoices WHERE id = ?', [need_uuid(input()['invoice_id'] ?? null, 'invoice')]), $cid, 'Invoice');
            $gw = gateway();
            if ($inv['status'] === 'paid') {
                fail(409, 'This invoice is already paid');
            }
            if ($inv['status'] === 'processing') {
                // A checkout was started earlier (maybe abandoned). Ask OMPAY what
                // became of it before allowing another one, so nobody pays twice.
                $open = val("SELECT id FROM payments WHERE invoice_id = ? AND status = 'processing' ORDER BY created_at DESC LIMIT 1", [$inv['id']]);
                $outcome = $open ? settle_payment($gw, $open) : 'processing';
                if ($outcome === 'successful') {
                    fail(409, 'This invoice is already paid');
                }
                if ($outcome !== 'failed') {
                    fail(409, 'A payment for this invoice is still in progress. Please try again in a few minutes.');
                }
            }
            $payment = billing_claim_invoice($inv['id'], 'hosted');
            if (!$payment) {
                fail(409, 'This invoice cannot be paid right now');
            }
            try {
                return ['redirect_url' => start_hosted_payment($gw, $payment, (float) $inv['total'], $inv['currency']), 'payment_id' => $payment];
            } catch (OmpayError) {
                fail(502, 'The payment page could not be opened. Please try again.');
            }
        },

        'POST billing/update-card' => function () {
            $u = need_user();
            $cid = company_scope($u, input()['company_id'] ?? null);
            $gw = gateway();
            $payment = billing_start_card_check($cid);
            try {
                return ['redirect_url' => start_hosted_payment($gw, $payment, (float) settings()['card_check_amount'], 'OMR'), 'payment_id' => $payment];
            } catch (OmpayError) {
                fail(502, 'The card page could not be opened. Please try again.');
            }
        },

        'POST billing/confirm' => function () {
            $u = need_user();
            $cid = company_scope($u, input()['company_id'] ?? null);
            $pay = owned(row('SELECT id, company_id FROM payments WHERE id = ?', [need_uuid(input()['payment_id'] ?? null, 'payment')]), $cid, 'Payment');
            return ['status' => settle_payment(gateway(), $pay['id'])];
        },

        'POST billing/cancel' => function () {
            $u = need_user();
            return ['status' => billing_set_cancellation(company_scope($u, input()['company_id'] ?? null), true)];
        },

        'POST billing/resume' => function () {
            $u = need_user();
            return ['status' => billing_set_cancellation(company_scope($u, input()['company_id'] ?? null), false)];
        },

        'GET invoice' => function () {
            $u = need_user();
            $inv = row('SELECT * FROM invoices WHERE id = ?', [need_uuid($_GET['id'] ?? null, 'invoice')]);
            // A client asking for someone else's invoice gets the same answer as for one that does not exist.
            if (!$inv || ($u['role'] !== 'admin' && $inv['company_id'] !== $u['company_id'])) {
                fail(404, 'Invoice not found');
            }
            $payments = rows(
                "SELECT id, flow, amount, card_brand, card_masked, updated_at FROM payments WHERE invoice_id = ? AND status = 'successful'",
                [$inv['id']],
            );
            return [
                'invoice' => fmt_invoice($inv, rows('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY created_at', [$inv['id']])),
                'company' => fmt_company(row('SELECT * FROM companies WHERE id = ?', [$inv['company_id']])),
                'payments' => array_map(fn ($p) => [
                    'id' => $p['id'], 'flow' => $p['flow'], 'amount' => (float) $p['amount'],
                    'card_brand' => $p['card_brand'], 'card_masked' => $p['card_masked'], 'updated_at' => iso($p['updated_at']),
                ], $payments),
            ];
        },

        /* --------------------------------------------------------- products */
        'GET products' => function () {
            $u = need_user();
            $cid = company_scope($u, $_GET['company_id'] ?? null);
            return ['products' => array_map('fmt_product', rows('SELECT * FROM products WHERE company_id = ? ORDER BY sort, created_at', [$cid]))];
        },

        'POST products' => function () {
            $u = need_user();
            $cid = company_scope($u, $_POST['company_id'] ?? null);
            $type = str($_POST['type'] ?? '', 10);
            if (!in_array($type, ['ring', 'watch', 'glasses', 'necklace'], true)) {
                fail(400, 'Choose a product type');
            }
            $name = str($_POST['name'] ?? '', 120);
            if ($name === '') {
                fail(400, 'Product name is required');
            }
            $sku = str($_POST['sku'] ?? '', 80) ?: null;
            $options = [];
            if ($type === 'necklace') {
                $o = json_decode((string) ($_POST['options'] ?? '{}'), true) ?: [];
                $options = [
                    'kind' => ($o['kind'] ?? '') === 'pearls' ? 'pearls' : 'chain',
                    'chainColor' => ($o['chainColor'] ?? '') === 'silver' ? 'silver' : 'gold',
                    'lengthCm' => max(35, min(90, (float) ($o['lengthCm'] ?? 45))),
                    'pendantMm' => max(4, min(80, (float) ($o['pendantMm'] ?? 15))),
                ];
            }
            $wantActive = ($_POST['active'] ?? '1') !== '0';
            $path = store_image('file', 'products', $cid, ['image/png' => 'png', 'image/webp' => 'webp'], 2097152);
            try {
                $id = tx(function () use ($cid, $type, $name, $sku, $options, $wantActive, $path) {
                    // Lock the plan row so two simultaneous adds cannot both slip under the limit.
                    $limit = (int) (val('SELECT product_limit FROM plans WHERE company_id = ? FOR UPDATE', [$cid]) ?? 0);
                    $live = (int) val('SELECT COUNT(*) FROM products WHERE company_id = ? AND active = 1', [$cid]);
                    $active = $wantActive && $live < $limit;
                    if ($sku !== null && val('SELECT 1 FROM products WHERE company_id = ? AND sku = ?', [$cid, $sku])) {
                        fail(409, 'Another product already uses this product code.');
                    }
                    $id = uuid();
                    q(
                        'INSERT INTO products (id, company_id, type, name, sku, price, image_path, options, active, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
                        [$id, $cid, $type, $name, $sku, str($_POST['price'] ?? '', 40) ?: null, $path, json_encode($options ?: new stdClass()), $active ? 1 : 0, now()],
                    );
                    return $id;
                });
            } catch (Throwable $e) {
                delete_upload($path);
                throw $e;
            }
            return ['product' => fmt_product(row('SELECT * FROM products WHERE id = ?', [$id]))];
        },

        'POST products/toggle' => function () {
            $u = need_user();
            $cid = company_scope($u, input()['company_id'] ?? null);
            $id = need_uuid(input()['id'] ?? null, 'product');
            tx(function () use ($cid, $id) {
                $limit = (int) (val('SELECT product_limit FROM plans WHERE company_id = ? FOR UPDATE', [$cid]) ?? 0);
                $p = owned(row('SELECT id, company_id, active FROM products WHERE id = ? FOR UPDATE', [$id]), $cid, 'Product');
                if (!$p['active']) {
                    $live = (int) val('SELECT COUNT(*) FROM products WHERE company_id = ? AND active = 1', [$cid]);
                    if ($live >= $limit) {
                        fail(409, 'Your plan’s product limit is reached. Switch another product off, or ask VYRO to add products to your plan.');
                    }
                }
                q('UPDATE products SET active = ? WHERE id = ?', [$p['active'] ? 0 : 1, $id]);
            });
            return ['ok' => true];
        },

        'POST products/delete' => function () {
            $u = need_user();
            $cid = company_scope($u, input()['company_id'] ?? null);
            $p = owned(row('SELECT id, company_id, image_path FROM products WHERE id = ?', [need_uuid(input()['id'] ?? null, 'product')]), $cid, 'Product');
            q('DELETE FROM products WHERE id = ?', [$p['id']]);
            delete_upload($p['image_path']);
            return ['ok' => true];
        },

        /* ---------------------------------------------------- notifications */
        'GET notifications' => function () {
            $u = need_user();
            if ($u['role'] === 'admin') {
                $list = rows(
                    "SELECT n.*, c.name AS company_name FROM notifications n LEFT JOIN companies c ON c.id = n.company_id
                      WHERE n.audience = 'admin' ORDER BY n.created_at DESC LIMIT 20",
                );
            } else {
                $list = rows(
                    "SELECT * FROM notifications WHERE audience = 'client' AND company_id = ? ORDER BY created_at DESC LIMIT 20",
                    [$u['company_id']],
                );
            }
            return ['notifications' => array_map('fmt_notice', $list)];
        },

        'POST notifications/read' => function () {
            $u = need_user();
            if ($u['role'] === 'admin') {
                q("UPDATE notifications SET read_at = ? WHERE audience = 'admin' AND read_at IS NULL", [now()]);
            } else {
                q("UPDATE notifications SET read_at = ? WHERE audience = 'client' AND company_id = ? AND read_at IS NULL", [now(), $u['company_id']]);
            }
            return ['ok' => true];
        },

        /* ------------------------------------------------------------ admin */
        'GET admin/clients' => function () {
            need_admin();
            $companies = rows('SELECT * FROM companies ORDER BY created_at DESC');
            $plans = array_column(rows('SELECT * FROM plans'), null, 'company_id');
            $subs = array_column(rows('SELECT * FROM subscriptions'), null, 'company_id');
            return ['clients' => array_map(fn ($c) => [
                'company' => fmt_company($c),
                'plan' => fmt_plan($plans[$c['id']] ?? null),
                'sub' => fmt_sub($subs[$c['id']] ?? null),
            ], $companies)];
        },

        'GET admin/overview' => function () {
            need_admin();
            $since = gmdate('Y-m-01 00:00:00', strtotime('-5 month'));
            return [
                'failed' => array_map('fmt_invoice', rows("SELECT * FROM invoices WHERE status = 'failed' ORDER BY created_at DESC")),
                'notices' => array_map('fmt_notice', rows(
                    "SELECT n.*, c.name AS company_name FROM notifications n LEFT JOIN companies c ON c.id = n.company_id
                      WHERE n.audience = 'admin' ORDER BY n.created_at DESC LIMIT 8",
                )),
                'revenue' => array_map(fn ($r) => ['month' => $r['month'], 'collected' => (float) $r['collected'], 'payments' => (int) $r['payments']], rows(
                    "SELECT DATE_FORMAT(updated_at, '%Y-%m-01') AS month, SUM(amount) AS collected, COUNT(*) AS payments
                       FROM payments WHERE status = 'successful' AND flow <> 'card_check' AND updated_at >= ?
                      GROUP BY month ORDER BY month",
                    [$since],
                )),
            ];
        },

        'GET admin/search' => function () {
            need_admin();
            $term = str($_GET['q'] ?? '', 80);
            if ($term === '') {
                return ['hits' => []];
            }
            $like = '%' . addcslashes($term, '%_\\') . '%';
            return ['hits' => rows(
                'SELECT id, name, store_name, logo_path FROM companies WHERE name LIKE ? OR store_name LIKE ? OR contact_email LIKE ? ORDER BY name LIMIT 6',
                [$like, $like, $like],
            )];
        },

        'GET admin/client' => function () {
            need_admin();
            $id = need_uuid($_GET['id'] ?? null, 'client');
            $company = row('SELECT * FROM companies WHERE id = ?', [$id]);
            if (!$company) {
                fail(404, 'Client not found.');
            }
            $key = row('SELECT public_key, allowed_domains FROM widget_keys WHERE company_id = ?', [$id]);
            return [
                'company' => fmt_company($company, true),
                'plan' => fmt_plan(row('SELECT * FROM plans WHERE company_id = ?', [$id])),
                'sub' => fmt_sub(row('SELECT * FROM subscriptions WHERE company_id = ?', [$id])),
                'invoices' => invoices_with_items($id, true),
                'extras' => array_map(fn ($e) => [
                    'id' => $e['id'], 'description' => $e['description'], 'amount' => (float) $e['amount'],
                    'bill_on' => $e['bill_on'], 'invoice_id' => $e['invoice_id'],
                ], rows('SELECT * FROM extra_charges WHERE company_id = ? ORDER BY created_at DESC', [$id])),
                'card' => fmt_card(default_card($id)),
                'key' => $key ? ['public_key' => $key['public_key'], 'allowed_domains' => json_decode($key['allowed_domains'], true) ?: []] : null,
                'registered' => (bool) val('SELECT 1 FROM users WHERE company_id = ? LIMIT 1', [$id]),
            ];
        },

        'POST admin/clients' => function () {
            $u = need_admin();
            $c = is_array(input()['company'] ?? null) ? input()['company'] : [];
            $p = is_array(input()['plan'] ?? null) ? input()['plan'] : [];
            $name = str($c['name'] ?? '', 150);
            if ($name === '') {
                fail(400, 'Company name is required');
            }
            $email = strtolower(str($c['contact_email'] ?? '', 200));
            if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                fail(400, 'Enter a valid client email');
            }
            $start = str($p['billing_start_date'] ?? '', 10);
            if ($start !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $start)) {
                fail(400, 'Invalid first charge date');
            }
            $months = ($p['contract_months'] ?? '') === '' || $p['contract_months'] === null ? null : (int) num($p['contract_months'], 'Contract months', 1);
            $cid = billing_create_client(
                [
                    'name' => $name, 'store_name' => str($c['store_name'] ?? '', 150), 'website' => str($c['website'] ?? '', 200),
                    'contact_name' => str($c['contact_name'] ?? '', 150), 'contact_email' => $email,
                    'contact_phone' => str($c['contact_phone'] ?? '', 40), 'notes' => str($c['notes'] ?? '', 2000),
                ],
                [
                    'name' => str($p['name'] ?? '', 80) ?: 'VYRO', 'currency' => 'OMR',
                    'setup_fee' => num($p['setup_fee'] ?? 0, 'Setup fee'),
                    'recurring_fee' => num($p['recurring_fee'] ?? null, 'Subscription fee'),
                    'billing_interval' => ($p['billing_interval'] ?? '') === 'annual' ? 'annual' : 'monthly',
                    'product_limit' => (int) num($p['product_limit'] ?? 0, 'Product limit'),
                    'billing_start_date' => $start ?: null, 'contract_months' => $months,
                    'cancellation_terms' => str($p['cancellation_terms'] ?? '', 2000) ?: null,
                ],
                clean_domains(input()['allowed_domains'] ?? []),
            );
            return ['company_id' => $cid, 'invite_url' => $email !== '' ? create_invite($cid, $email, $u['id']) : null];
        },

        'POST admin/invite' => function () {
            $u = need_admin();
            $cid = need_uuid(input()['company_id'] ?? null, 'company');
            if (!val('SELECT 1 FROM companies WHERE id = ?', [$cid])) {
                fail(404, 'Client not found.');
            }
            return ['invite_url' => create_invite($cid, strtolower(in_str('email', 200)), $u['id'])];
        },

        'POST admin/activate' => function () {
            need_admin();
            billing_activate(need_uuid(input()['company_id'] ?? null, 'company'));
            return ['ok' => true];
        },

        'POST admin/mark-paid' => function () {
            need_admin();
            billing_offline_paid(need_uuid(input()['invoice_id'] ?? null, 'invoice'), in_str('note', 300) ?: null);
            return ['ok' => true];
        },

        'POST admin/charge' => function () {
            need_admin();
            return ['outcome' => charge_invoice_with_saved_card(gateway(), need_uuid(input()['invoice_id'] ?? null, 'invoice'))];
        },

        'POST admin/plan' => function () {
            need_admin();
            $cid = need_uuid(input()['company_id'] ?? null, 'company');
            $months = (input()['contract_months'] ?? '') === '' || input()['contract_months'] === null ? null : (int) num(input()['contract_months'], 'Contract months', 1);
            q(
                'UPDATE plans SET recurring_fee = ?, product_limit = ?, billing_interval = ?, contract_months = ?, cancellation_terms = ? WHERE company_id = ?',
                [num(input()['recurring_fee'] ?? null, 'Subscription fee'), (int) num(input()['product_limit'] ?? null, 'Product limit'),
                    (input()['billing_interval'] ?? '') === 'annual' ? 'annual' : 'monthly', $months, in_str('cancellation_terms', 2000) ?: null, $cid],
            );
            return ['ok' => true];
        },

        'POST admin/extras' => function () {
            $u = need_admin();
            $cid = need_uuid(input()['company_id'] ?? null, 'company');
            $description = in_str('description', 255);
            if ($description === '') {
                fail(400, 'Describe the charge');
            }
            q(
                'INSERT INTO extra_charges (id, company_id, description, amount, bill_on, created_by, created_at) VALUES (?,?,?,?,?,?,?)',
                [uuid(), $cid, $description, num(input()['amount'] ?? null, 'Amount', 0.001), today(), $u['id'], now()],
            );
            return ['ok' => true];
        },

        'POST admin/extras/delete' => function () {
            need_admin();
            // Only charges that are not on an invoice yet can be removed.
            q('DELETE FROM extra_charges WHERE id = ? AND invoice_id IS NULL', [need_uuid(input()['id'] ?? null, 'charge')]);
            return ['ok' => true];
        },

        'POST admin/widget' => function () {
            need_admin();
            $v = in_str('override', 10);
            if (!in_array($v, ['auto', 'force_on', 'force_off'], true)) {
                fail(400, 'Invalid setting');
            }
            q('UPDATE subscriptions SET widget_override = ?, updated_at = ? WHERE company_id = ?',
                [$v === 'auto' ? null : $v, now(), need_uuid(input()['company_id'] ?? null, 'company')]);
            return ['ok' => true];
        },

        'POST admin/domains' => function () {
            need_admin();
            q('UPDATE widget_keys SET allowed_domains = ? WHERE company_id = ?',
                [json_encode(clean_domains(input()['domains'] ?? [])), need_uuid(input()['company_id'] ?? null, 'company')]);
            return ['ok' => true];
        },

        'POST admin/notes' => function () {
            need_admin();
            q('UPDATE companies SET notes = ? WHERE id = ?', [in_str('notes', 5000) ?: null, need_uuid(input()['company_id'] ?? null, 'company')]);
            return ['ok' => true];
        },

        'GET admin/invoices' => function () {
            need_admin();
            return ['invoices' => array_map(
                fn ($i) => fmt_invoice($i) + ['company_name' => $i['company_name']],
                rows("SELECT i.*, c.name AS company_name FROM invoices i JOIN companies c ON c.id = i.company_id
                       WHERE i.status <> 'void' ORDER BY i.created_at DESC, i.number DESC LIMIT 500"),
            )];
        },

        'GET admin/settings' => function () {
            need_admin();
            $s = settings();
            return ['grace_days' => (int) $s['grace_days'], 'max_auto_attempts' => (int) $s['max_auto_attempts'], 'reminder_days' => (int) $s['reminder_days']];
        },

        'POST admin/settings' => function () {
            need_admin();
            $int = function (string $k, int $min, int $max) {
                $v = (int) num(input()[$k] ?? null, $k, $min);
                if ($v > $max) {
                    fail(400, "$k must be at most $max");
                }
                return $v;
            };
            q('UPDATE app_settings SET grace_days = ?, max_auto_attempts = ?, reminder_days = ? WHERE id = 1',
                [$int('grace_days', 0, 60), $int('max_auto_attempts', 1, 10), $int('reminder_days', 0, 30)]);
            return ['ok' => true];
        },
    ];
}

function clean_domains(mixed $list): array
{
    $out = [];
    foreach (is_array($list) ? $list : [] as $d) {
        $d = strtolower(str($d, 200));
        $d = preg_replace('#^https?://#', '', $d) ?? '';
        $d = preg_replace('#[/:].*$#', '', $d) ?? '';
        if ($d !== '' && preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/', $d)) {
            $out[] = $d;
        }
    }
    return array_values(array_unique($out));
}

/** The payment gateway; tests swap in a fake through $GLOBALS['vyro_gateway']. */
function gateway(): Gateway
{
    return $GLOBALS['vyro_gateway'] ?? Ompay::fromConfig();
}
