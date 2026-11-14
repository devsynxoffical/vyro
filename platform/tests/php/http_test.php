<?php
declare(strict_types=1);

/**
 * End-to-end API test over real HTTP: starts the API and a fake OMPAY on
 * local ports, then drives them like browsers would.
 *   php platform/tests/php/http_test.php
 */

$API_PORT = 8791;
$OMPAY_PORT = 8792;
$tmp = sys_get_temp_dir() . '/vyro-http-test-' . getmypid();
@mkdir($tmp, 0777, true);
$uploads = "$tmp/uploads";
$config = "$tmp/config.php";
file_put_contents($config, '<?php return ' . var_export([
    'db_host' => getenv('VYRO_TEST_DB_HOST') ?: 'localhost',
    'db_name' => getenv('VYRO_TEST_DB_NAME') ?: 'vyro_test',
    'db_user' => getenv('VYRO_TEST_DB_USER') ?: 'vyro',
    'db_password' => getenv('VYRO_TEST_DB_PASSWORD') ?: 'testpass',
    'app_url' => "http://127.0.0.1:$API_PORT",
    'timezone' => 'Asia/Muscat',
    'ompay_base_url' => "http://127.0.0.1:$OMPAY_PORT",
    'ompay_api_key' => 'test-key',
    'ompay_api_secret' => 'test-secret',
    'cron_secret' => 'test-cron-secret',
    'upload_dir' => $uploads,
    'admin_emails' => 'boss@vyro.test',
], true) . ';');
putenv("VYRO_CONFIG=$config");
putenv('VYRO_TEST=1');
putenv("FAKE_OMPAY_STATE=$tmp/ompay.json");
@unlink(sys_get_temp_dir() . '/vyro-mail.log');

$api = __DIR__ . '/../../../vyro-site/public/api';
require "$api/lib/core.php";
require "$api/lib/auth.php";
require "$api/lib/migrate.php";

// Fresh database; the schema is applied through the API below.
db()->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach (db()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
    db()->exec("DROP TABLE `$t`");
}
db()->exec('SET FOREIGN_KEY_CHECKS = 1');

$procs = [];
foreach ([[$API_PORT, __DIR__ . '/router.php'], [$OMPAY_PORT, __DIR__ . '/fake_ompay_server.php']] as [$port, $router]) {
    // Several workers so parallel requests really run in parallel.
    $procs[] = proc_open(
        ['php', '-S', "127.0.0.1:$port", $router],
        [1 => ['file', "$tmp/server-$port.log", 'a'], 2 => ['file', "$tmp/server-$port.log", 'a']],
        $pipes,
        null,
        array_merge(getenv(), ['PHP_CLI_SERVER_WORKERS' => '6']),
    );
}
register_shutdown_function(function () use (&$procs, $tmp) {
    foreach ($procs as $p) {
        proc_terminate($p);
    }
});
usleep(900000);

$checks = 0;
function eq(mixed $actual, mixed $expected, string $msg): void
{
    global $checks;
    $checks++;
    if ($actual != $expected) {
        fwrite(STDERR, "FAIL: $msg — expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n");
        exit(1);
    }
}
function ok(mixed $cond, string $msg): void
{
    eq((bool) $cond, true, $msg);
}

/** A browser: keeps its own cookies and CSRF token. */
final class Browser
{
    public ?string $csrf = null;
    private string $jar;
    public int $status = 0;
    public string $raw = '';

    public function __construct(private string $base, public array $headers = [])
    {
        $this->jar = tempnam(sys_get_temp_dir(), 'jar');
    }

    public function handle(string $method, string $path, ?array $body, bool $multipart = false, bool $sendCsrf = true): CurlHandle
    {
        $ch = curl_init($this->base . '/api/' . $path);
        $headers = $this->headers;
        if ($this->csrf && $sendCsrf) {
            $headers[] = 'X-CSRF-Token: ' . $this->csrf;
        }
        if ($body !== null && !$multipart) {
            $headers[] = 'Content-Type: application/json';
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        } elseif ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_COOKIEJAR => $this->jar, CURLOPT_COOKIEFILE => $this->jar, CURLOPT_TIMEOUT => 30,
        ]);
        return $ch;
    }

    public function call(string $method, string $path, ?array $body = null, bool $multipart = false, bool $sendCsrf = true): array
    {
        $ch = $this->handle($method, $path, $body, $multipart, $sendCsrf);
        $this->raw = (string) curl_exec($ch);
        $this->status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        $json = json_decode($this->raw, true);
        if (is_array($json) && isset($json['csrf'])) {
            $this->csrf = $json['csrf'];
        }
        return is_array($json) ? $json : [];
    }

    public function get(string $path): array
    {
        return $this->call('GET', $path);
    }

    public function post(string $path, array $body = []): array
    {
        return $this->call('POST', $path, $body);
    }
}

function ompay(string $path, array $body): array
{
    global $OMPAY_PORT;
    $ch = curl_init("http://127.0.0.1:$OMPAY_PORT$path");
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($body), CURLOPT_RETURNTRANSFER => true]);
    $r = json_decode((string) curl_exec($ch), true);
    curl_close($ch);
    return $r ?: [];
}

function png(string $path, int $w = 40, int $h = 40): string
{
    $im = imagecreatetruecolor($w, $h);
    imagesavealpha($im, true);
    imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
    imagefilledellipse($im, (int) ($w / 2), (int) ($h / 2), $w - 6, $h - 6, imagecolorallocate($im, 200, 30, 60));
    imagepng($im, $path);
    return $path;
}

$base = "http://127.0.0.1:$API_PORT";
$cron = new Browser($base, ['X-Cron-Secret: test-cron-secret']);
$anon = new Browser($base);

/* ---------------------------------------------------------- setup + admin */
$anon->post('cron/migrate');
eq($anon->status, 403, 'migrate needs the cron secret');
$bad = new Browser($base, ['X-Cron-Secret: wrong']);
$bad->post('cron/billing-run');
eq($bad->status, 403, 'wrong cron secret refused');
$r = $cron->post('cron/migrate');
eq($r['applied'], ['001_init.sql'], 'schema applied through the API');
eq($cron->post('cron/migrate')['applied'], [], 'migrate is repeatable');

$r = $cron->post('setup/admin', ['email' => 'boss@vyro.test']);
ok(preg_match('#/login\?reset=([0-9a-f]{64})$#', $r['set_password_url'] ?? '', $m), 'admin set-password link');
$anon->post('auth/reset', ['token' => $m[1], 'password' => 'short']);
eq($anon->status, 400, 'weak password refused');
$anon->post('auth/reset', ['token' => $m[1], 'password' => 'a-strong-admin-pass']);
eq($anon->status, 200, 'password set');
$anon->post('auth/reset', ['token' => $m[1], 'password' => 'another-strong-pass']);
eq($anon->status, 410, 'set-password link works once');

$admin = new Browser($base);
eq($admin->get('me')['user'], null, 'signed out by default');
$admin->post('auth/login', ['email' => 'boss@vyro.test', 'password' => 'wrong-password-1']);
eq($admin->status, 401, 'wrong password refused');
$r = $admin->post('auth/login', ['email' => 'BOSS@vyro.test', 'password' => 'a-strong-admin-pass']);
eq($r['user']['role'] ?? null, 'admin', 'admin signs in');
ok(str_contains(file_get_contents((new ReflectionProperty($admin, 'jar'))->getValue($admin)) ?: '', '#HttpOnly_'), 'session cookie is HttpOnly');

/* ------------------------------------------------- permissions when signed out */
foreach (['portal', 'admin/clients', 'products', 'notifications', 'admin/settings'] as $p) {
    $anon->get($p);
    eq($anon->status, 401, "signed-out GET $p refused");
}
$admin->call('POST', 'admin/settings', ['grace_days' => 1, 'max_auto_attempts' => 1, 'reminder_days' => 1], false, false);
eq($admin->status, 403, 'a change without the CSRF token is refused');

/* ------------------------------------------------------------- two clients */
$today = (new DateTimeImmutable('now', new DateTimeZone('Asia/Muscat')))->format('Y-m-d');
$plan = ['setup_fee' => 150, 'recurring_fee' => 20, 'product_limit' => 2, 'billing_interval' => 'monthly'];
$a = $admin->post('admin/clients', ['company' => ['name' => 'Alpha Jewels', 'contact_email' => 'owner@alpha.test'], 'plan' => $plan, 'allowed_domains' => ['https://www.alpha.test/shop']]);
$b = $admin->post('admin/clients', ['company' => ['name' => 'Beta Optics', 'contact_email' => 'owner@beta.test'], 'plan' => $plan]);
ok(isset($a['company_id'], $b['company_id']), 'two clients created');
$admin->post('admin/clients', ['company' => ['name' => 'X'], 'plan' => ['recurring_fee' => -5]]);
eq($admin->status, 400, 'negative price refused');

preg_match('/invite=([0-9a-f]{64})/', $a['invite_url'], $ia);
preg_match('/invite=([0-9a-f]{64})/', $b['invite_url'], $ib);
eq($anon->post('register/lookup', ['token' => $ia[1]])['company_name'], 'Alpha Jewels', 'invite lookup');
$anon->post('register/lookup', ['token' => str_repeat('0', 64)]);
eq($anon->status, 410, 'unknown invite refused');

$alice = new Browser($base);
$r = $alice->post('register/complete', ['token' => $ia[1], 'password' => 'alice-strong-pass', 'full_name' => 'Alice', 'company' => ['store_name' => 'Alpha Store']]);
eq($r['user']['company_id'] ?? null, $a['company_id'], 'client registered into their company');
$anon->post('register/complete', ['token' => $ia[1], 'password' => 'someone-else-pass', 'full_name' => 'Mallory']);
eq($anon->status, 410, 'an invite works once');
$bob = new Browser($base);
$bob->post('register/complete', ['token' => $ib[1], 'password' => 'bob-strong-pass1', 'full_name' => 'Bob']);

/* --------------------------------------------- a client cannot reach others */
$pa = $alice->get('portal');
eq($pa['company']['id'], $a['company_id'], 'client sees own account');
eq($pa['company']['store_name'], 'Alpha Store', 'registration details saved');
ok(!array_key_exists('notes', $pa['company']), 'internal notes are not sent to clients');
eq($alice->get('portal?company_id=' . $b['company_id'])['company']['id'], $a['company_id'], 'asking for another company still returns own');
foreach (['admin/clients', 'admin/overview', 'admin/invoices', 'admin/settings', 'admin/client?id=' . $b['company_id'], 'admin/search?q=beta'] as $p) {
    $alice->get($p);
    eq($alice->status, 403, "client refused on $p");
}
foreach ([
    ['admin/plan', ['company_id' => $a['company_id'], 'recurring_fee' => 0, 'product_limit' => 999]],
    ['admin/widget', ['company_id' => $a['company_id'], 'override' => 'force_on']],
    ['admin/activate', ['company_id' => $a['company_id']]],
    ['admin/extras', ['company_id' => $b['company_id'], 'description' => 'x', 'amount' => 1]],
    ['admin/clients', ['company' => ['name' => 'Evil'], 'plan' => ['recurring_fee' => 1]]],
] as [$p, $body]) {
    $alice->post($p, $body);
    eq($alice->status, 403, "client refused on POST $p");
}
$bInvoice = $bob->get('portal')['invoices'][0]['id'];
$aInvoice = $pa['invoices'][0]['id'];
$alice->get("invoice?id=$bInvoice");
eq($alice->status, 404, 'another client’s invoice looks like it does not exist');
$alice->post('billing/pay', ['invoice_id' => $bInvoice]);
eq($alice->status, 404, 'cannot pay (or probe) another client’s invoice');
$alice->post('admin/mark-paid', ['invoice_id' => $aInvoice]);
eq($alice->status, 403, 'a client cannot mark their own invoice paid');
eq($alice->get('portal')['invoices'][0]['status'], 'open', 'invoice untouched');

/* ------------------------------------------------- pay the setup fee (hosted) */
$r = $alice->post('billing/pay', ['invoice_id' => $aInvoice]);
ok(str_starts_with($r['redirect_url'] ?? '', 'http://ompay.test/pay/'), 'sent to OMPAY’s hosted page');
$pay = $r['payment_id'];
eq($alice->post('billing/confirm', ['payment_id' => $pay])['status'], 'processing', 'not paid until OMPAY confirms');
$alice->post('billing/pay', ['invoice_id' => $aInvoice]);
eq($alice->status, 409, 'no second checkout while one is in progress');
$bob->post('billing/confirm', ['payment_id' => $pay]);
eq($bob->status, 404, 'another client cannot confirm this payment');
ompay('/_test/complete', ['id' => 'tx1', 'ok' => true, 'token' => 'tok_alpha_secret']);
eq($alice->post('billing/confirm', ['payment_id' => $pay])['status'], 'successful', 'payment confirmed');
$pa = $alice->get('portal');
eq($pa['sub']['status'], 'active', 'subscription active');
eq($pa['sub']['live'], true, 'widget live');
eq($pa['card']['masked_pan'], '464156******3343', 'saved card shown masked');
ok(!str_contains($alice->raw, 'tok_alpha_secret'), 'the card token never reaches the browser');
ok(!str_contains($admin->get('admin/client?id=' . $a['company_id']) ? $admin->raw : '', 'tok_alpha_secret'), 'not even for admins');

/* -------------------------------------------- five simultaneous pay clicks */
$bobInv = $bInvoice;
$mh = curl_multi_init();
$handles = [];
for ($i = 0; $i < 5; $i++) {
    $handles[] = $h = $bob->handle('POST', 'billing/pay', ['invoice_id' => $bobInv]);
    curl_multi_add_handle($mh, $h);
}
do {
    curl_multi_exec($mh, $running);
    curl_multi_select($mh, 0.2);
} while ($running);
$codes = array_map(fn ($h) => (int) curl_getinfo($h, CURLINFO_RESPONSE_CODE), $handles);
eq(count(array_keys($codes, 200)), 1, 'five simultaneous pay clicks start exactly one checkout (' . implode(',', $codes) . ')');
eq((int) val('SELECT COUNT(*) FROM payments WHERE invoice_id = ?', [$bobInv]), 1, 'one payment row');

/* ------------------------------------------------------------- products */
$img = png("$tmp/ring.png");
$mk = fn (Browser $who, string $name, string $sku, array $extra = []) => $who->call('POST', 'products', [
    'type' => 'ring', 'name' => $name, 'sku' => $sku, 'price' => '120 OMR', 'file' => new CURLFile(png("$GLOBALS[tmp]/$sku.png"), 'image/png', 'x.png'),
] + $extra, true);
$p1 = $mk($alice, 'Ruby Ring', 'R-1');
eq($alice->status, 200, 'product added');
ok(preg_match('#^products/' . $a['company_id'] . '/[0-9a-f]{24}\.png$#', $p1['product']['image_path']), 'stored under own folder with a random name');
ok(is_file("$uploads/" . $p1['product']['image_path']), 'image saved');
$mk($alice, 'Gold Ring', 'R-2');
$p3 = $mk($alice, 'Third', 'R-3');
eq($p3['product']['active'], false, 'over the plan limit: saved switched off');
$alice->post('products/toggle', ['id' => $p3['product']['id']]);
eq($alice->status, 409, 'cannot switch on past the plan limit');
$mk($alice, 'Dup', 'R-1');
eq($alice->status, 409, 'duplicate product code refused');
$mk($alice, 'Sneaky', 'R-9', ['company_id' => $b['company_id']]);
eq((int) val('SELECT COUNT(*) FROM products WHERE company_id = ?', [$b['company_id']]), 0, 'cannot plant a product in another company');
file_put_contents("$tmp/evil.png", '<?php echo "pwned";');
$alice->call('POST', 'products', ['type' => 'ring', 'name' => 'Evil', 'file' => new CURLFile("$tmp/evil.png", 'image/png', 'evil.php')], true);
eq($alice->status, 400, 'a script disguised as an image is refused');
eq(glob("$uploads/products/*/*.php"), [], 'no script was stored');
$bob->post('products/toggle', ['id' => $p1['product']['id']]);
eq($bob->status, 404, 'cannot switch another client’s product');
$bob->post('products/delete', ['id' => $p1['product']['id']]);
eq($bob->status, 404, 'cannot delete another client’s product');
eq(count($bob->get('products')['products']), 0, 'sees no products of others');
eq(count($alice->get('products')['products']), 4, 'own products intact');

/* ----------------------------------------------------------------- widget */
$key = $pa['widgetKey'];
$w = (new Browser($base, ['Origin: https://shop.alpha.test']))->get("widget-status?key=$key");
eq($w['active'], true, 'widget active on the client’s own domain');
eq(count($w['products']), 2, 'serves only the live products');
ok(str_starts_with($w['products'][0]['image'], "$base/uploads/products/"), 'absolute image addresses');
eq((new Browser($base, ['Origin: https://evil.test']))->get("widget-status?key=$key")['reason'], 'domain_not_allowed', 'other websites refused');
eq((new Browser($base, ['Origin: https://alpha.test']))->get('widget-status?key=' . $bob->get('portal')['widgetKey'])['reason'], 'inactive', 'unpaid client is off');
eq($anon->get('widget-status?key=nope')['reason'], 'unknown_key', 'bad key');
$admin->post('admin/widget', ['company_id' => $a['company_id'], 'override' => 'force_off']);
eq((new Browser($base, ['Origin: https://alpha.test']))->get("widget-status?key=$key")['active'], false, 'admin force-off wins');
$admin->post('admin/widget', ['company_id' => $a['company_id'], 'override' => 'auto']);

/* ----------------------------------------- renewal: 20 + 8 extra, then 20 */
$admin->post('admin/extras', ['company_id' => $a['company_id'], 'description' => '10 extra products', 'amount' => 8]);
$run = $cron->post('cron/billing-run');
eq($run['errors'], [], 'billing run clean');
eq($run['renewals']['successful'], 1, 'renewal charged to the saved card');
$state = ompay('/_test/mode', ['mode' => 'ok']);
eq(end($state['token_charges'])['amount'], 28, 'charged 20 + 8 = 28');
eq(end($state['token_charges'])['token'], 'tok_alpha_secret', 'with the saved card');
eq($cron->post('cron/billing-run')['renewals']['successful'], 0, 'running again charges nothing');
$c = $admin->get('admin/client?id=' . $a['company_id']);
eq($c['invoices'][0]['total'], 28, 'invoice shows 28');
eq(count($c['invoices'][0]['invoice_items']), 2, 'with both lines');
ok($run['emails'] > 0 && str_contains((string) @file_get_contents(sys_get_temp_dir() . '/vyro-mail.log'), 'owner@alpha.test'), 'notifications emailed');

/* -------------------------------------------- failed renewal -> grace -> off */
ompay('/_test/mode', ['mode' => 'decline']);
q('UPDATE subscriptions SET next_billing_date = ?, current_period_end = ? WHERE company_id = ?', [$today, $today, $a['company_id']]);
q("UPDATE invoices SET period_key = NULL WHERE company_id = ? AND kind = 'subscription'", [$a['company_id']]);
$run = $cron->post('cron/billing-run');
eq($run['renewals']['failed'], 1, 'declined renewal');
$pa = $alice->get('portal');
eq($pa['sub']['status'], 'past_due', 'grace period starts');
eq($pa['sub']['live'], true, 'still live during grace');
eq($pa['invoices'][0]['total'], 20, 'the extra was one-off: back to 20');
ok(count($alice->get('notifications')['notifications']) > 0, 'client notified');
ok(count(array_filter($admin->get('admin/overview')['failed'], fn ($i) => $i['company_id'] === $a['company_id'])) === 1, 'admin sees the failed payment');
q('UPDATE subscriptions SET grace_until = ? WHERE company_id = ?', [now(-60), $a['company_id']]);
eq($cron->post('cron/billing-run')['suspended'], 1, 'suspended after the grace period');
eq((new Browser($base, ['Origin: https://alpha.test']))->get("widget-status?key=$key")['active'], false, 'widget off when suspended');
$admin->post('admin/mark-paid', ['invoice_id' => $pa['invoices'][0]['id'], 'note' => 'bank transfer']);
eq($alice->get('portal')['sub']['status'], 'active', 'paying brings it back');

/* -------------------------------------------------------- cancel / resume */
eq($alice->post('billing/cancel')['status'], 'cancel_scheduled', 'client cancels');
eq($alice->get('portal')['sub']['live'], true, 'keeps running until the period ends');
eq($alice->post('billing/resume')['status'], 'active', 'client resumes');
$bob->post('billing/cancel', ['company_id' => $a['company_id']]);
eq($alice->get('portal')['sub']['status'], 'active', 'another client cannot cancel it');

/* ----------------------------------------------------- profile and logo */
$alice->post('portal/company', ['name' => 'Alpha Jewels LLC', 'contact_email' => 'not-an-email']);
eq($alice->status, 400, 'bad contact email refused');
$alice->post('portal/company', ['name' => 'Alpha Jewels LLC', 'website' => 'alpha.test', 'notes' => 'hacked', 'company_id' => $b['company_id']]);
eq($admin->get('admin/client?id=' . $b['company_id'])['company']['name'], 'Beta Optics', 'cannot edit another company');
eq($admin->get('admin/client?id=' . $a['company_id'])['company']['notes'], '', 'clients cannot write internal notes');
$r = $alice->call('POST', 'portal/logo', ['file' => new CURLFile($img, 'image/png', 'logo.png')], true);
ok(preg_match('#^logos/' . $a['company_id'] . '/#', $r['logo_path'] ?? ''), 'logo stored');

/* --------------------------------------------------------- two-step login */
$enroll = $admin->post('auth/mfa/enroll');
ok(preg_match('/^[A-Z2-7]{20}$/', $enroll['secret'] ?? ''), 'authenticator secret issued');
$admin->post('auth/mfa/confirm', ['code' => '000000']);
eq($admin->status, 400, 'wrong code refused');
$admin->post('auth/mfa/confirm', ['code' => totp_code($enroll['secret'], intdiv(time(), 30))]);
eq($admin->status, 200, 'two-step login switched on');
$admin2 = new Browser($base);
$r = $admin2->post('auth/login', ['email' => 'boss@vyro.test', 'password' => 'a-strong-admin-pass']);
eq([$r['user'], $r['mfa_required']], [null, true], 'password alone is no longer enough');
$admin2->get('admin/clients');
eq($admin2->status, 401, 'no data before the second step');
eq($admin2->get('me')['user'], null, 'not signed in before the second step');
$admin2->post('auth/mfa', ['code' => '123456']);
eq($admin2->status, 401, 'wrong second-step code refused');
$r = $admin2->post('auth/mfa', ['code' => totp_code($enroll['secret'], intdiv(time(), 30))]);
eq($r['user']['role'] ?? null, 'admin', 'second step passes');
eq($admin2->get('admin/clients') ? $admin2->status : 0, 200, 'then data is available');

/* ------------------------------------------------------------ misc safety */
$alice->post('auth/password', ['password' => 'alice-new-strong-pass']);
$alice->post('auth/logout');
$alice->get('portal');
eq($alice->status, 401, 'signed out after logout');
$again = new Browser($base);
$again->post('auth/login', ['email' => 'owner@alpha.test', 'password' => 'alice-strong-pass']);
eq($again->status, 401, 'old password no longer works');
$anon->post('auth/forgot', ['email' => 'owner@alpha.test']);
$anon->post('auth/forgot', ['email' => 'nobody@nowhere.test']);
eq($anon->status, 200, 'forgot-password gives the same answer for unknown emails');
ok(substr_count((string) file_get_contents(sys_get_temp_dir() . '/vyro-mail.log'), 'Reset your VYRO password') === 1, 'reset email only for the real account');
$anon->get('admin/client?id=' . urlencode("x' OR '1'='1"));
eq($anon->status, 401, 'injection attempt gets nothing');
$admin->get('admin/client?id=' . urlencode("x' OR '1'='1"));
eq($admin->status, 400, 'malformed ids are rejected');
$admin->get('admin/search?q=' . urlencode("%' OR 1=1 -- "));
eq($admin->get('admin/search?q=alpha')['hits'][0]['name'] ?? null, 'Alpha Jewels LLC', 'search works');
$attacker = new Browser($base);
$codes = [];
for ($i = 0; $i < 10; $i++) {
    $attacker->post('auth/login', ['email' => 'owner@beta.test', 'password' => "guess-number-$i"]);
    $codes[] = $attacker->status;
}
eq(end($codes), 429, 'password guessing is throttled (' . implode(',', $codes) . ')');
foreach (['api/config.php', 'api/lib/core.php'] as $f) {
    ok(!str_contains((string) @file_get_contents("$base/$f"), 'db_password'), "$f does not leak");
}
$anon->get('nope');
eq($anon->status, 404, 'unknown route');
ok(!str_contains($anon->raw, 'SQL') && !str_contains($anon->raw, '.php'), 'errors reveal no internals');

echo "ALL HTTP TESTS PASSED ($checks checks)\n";
