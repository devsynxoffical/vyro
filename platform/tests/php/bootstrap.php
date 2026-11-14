<?php
declare(strict_types=1);

// Test bootstrap: a throwaway database with the real schema, and a fake OMPAY.
// Usage: php platform/tests/php/billing_test.php
//   (expects a local MySQL/MariaDB; override with VYRO_TEST_DB_* env vars)

$config = tempnam(sys_get_temp_dir(), 'vyrocfg') . '.php';
file_put_contents($config, '<?php return ' . var_export([
    'db_host' => getenv('VYRO_TEST_DB_HOST') ?: 'localhost',
    'db_name' => getenv('VYRO_TEST_DB_NAME') ?: 'vyro_test',
    'db_user' => getenv('VYRO_TEST_DB_USER') ?: 'vyro',
    'db_password' => getenv('VYRO_TEST_DB_PASSWORD') ?: 'testpass',
    'app_url' => 'https://app.test',
    'timezone' => 'Asia/Muscat',
    'cron_secret' => 'test-cron-secret',
    'upload_dir' => sys_get_temp_dir() . '/vyro-uploads',
], true) . ';');
putenv("VYRO_CONFIG=$config");

$api = __DIR__ . '/../../../vyro-site/public/api';
require "$api/lib/core.php";
require "$api/lib/auth.php";
require "$api/lib/ompay.php";
require "$api/lib/billing.php";
require "$api/lib/migrate.php";

function reset_db(): void
{
    db()->exec('SET FOREIGN_KEY_CHECKS = 0');
    foreach (db()->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN) as $t) {
        db()->exec("DROP TABLE `$t`");
    }
    db()->exec('SET FOREIGN_KEY_CHECKS = 1');
    migrate();
}

$GLOBALS['checks'] = 0;
function eq(mixed $actual, mixed $expected, string $msg): void
{
    $GLOBALS['checks']++;
    if ($actual != $expected) {
        fwrite(STDERR, "FAIL: $msg — expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . "\n");
        exit(1);
    }
}
function ok(bool $cond, string $msg): void
{
    eq($cond, true, $msg);
}

final class FakeOmpay implements Gateway
{
    /** @var array<string,array> */
    public array $tx = [];
    public array $tokenCharges = [];
    public array $reversed = [];
    public string $mode = 'ok'; // ok | decline | timeout | otp
    private int $n = 0;

    public function bankHosted(float $amount, string $currency, string $returnUrl, string $reference): array
    {
        $id = 'tx' . ++$this->n;
        $this->tx[$id] = ['transaction_id' => $id, 'reference' => $reference, 'status' => 'PROCESSING', 'amount' => $amount];
        return ['transaction_id' => $id, 'status' => 'PROCESSING', 'redirect_url' => "https://ompay.test/pay/$id"];
    }

    /** The customer finished (or failed) on OMPAY's page. */
    public function completeHosted(string $id, bool $ok, ?string $token = null): void
    {
        $this->tx[$id]['status'] = $ok ? 'SUCCESSFUL' : 'FAILED';
        if (!$ok) {
            $this->tx[$id]['error_message'] = 'Declined';
        }
        if ($ok && $token) {
            $this->tx[$id]['saved_card'] = ['token' => $token, 'brand' => 'VISA', 'masked_pan' => '464156******3343'];
        }
    }

    public function byReference(string $reference): ?string
    {
        foreach ($this->tx as $id => $t) {
            if ($t['reference'] === $reference) {
                return $id;
            }
        }
        return null;
    }

    public function payWithToken(float $amount, string $currency, string $token, string $returnUrl, string $reference): array
    {
        $this->tokenCharges[] = ['amount' => $amount, 'reference' => $reference];
        $id = 'tx' . ++$this->n;
        if ($this->mode === 'timeout') {
            // The charge reached OMPAY and succeeded, but we never got the answer.
            $this->tx[$id] = ['transaction_id' => $id, 'reference' => $reference, 'status' => 'SUCCESSFUL'];
            throw new OmpayError('NETWORK', 'timeout', 0);
        }
        if ($this->mode === 'otp') {
            $this->tx[$id] = ['transaction_id' => $id, 'reference' => $reference, 'status' => 'PROCESSING'];
            return ['transaction_id' => $id, 'status' => 'PROCESSING', 'otp_required' => true];
        }
        $status = $this->mode === 'ok' ? 'SUCCESSFUL' : 'FAILED';
        $this->tx[$id] = ['transaction_id' => $id, 'reference' => $reference, 'status' => $status];
        return ['transaction_id' => $id, 'status' => $status, 'error_message' => $status === 'FAILED' ? 'Insufficient funds' : null];
    }

    public function inquiry(?string $transactionId, ?string $reference): array
    {
        $id = $transactionId ?? $this->byReference((string) $reference);
        if (!$id || !isset($this->tx[$id])) {
            throw new OmpayError('TRANSACTION_NOT_FOUND', 'not found', 404);
        }
        return $this->tx[$id];
    }

    public function reverse(string $transactionId): void
    {
        $this->reversed[] = $transactionId;
    }

    public function refund(string $transactionId): void
    {
    }
}

function new_client(string $name, array $plan, array $domains = []): string
{
    return billing_create_client(
        ['name' => $name, 'store_name' => '', 'website' => '', 'contact_name' => '', 'contact_email' => '', 'contact_phone' => '', 'notes' => ''],
        $plan + ['name' => 'VYRO', 'currency' => 'OMR', 'setup_fee' => 0, 'billing_interval' => 'monthly', 'product_limit' => 0,
            'billing_start_date' => null, 'contract_months' => null, 'cancellation_terms' => null],
        $domains,
    );
}
function sub(string $companyId): array
{
    return row('SELECT * FROM subscriptions WHERE company_id = ?', [$companyId]);
}
