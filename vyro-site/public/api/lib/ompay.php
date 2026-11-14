<?php
declare(strict_types=1);

/**
 * Client for OMPAY TruePay (https://developer.truepay.ompay.om/docs).
 *
 * Capabilities VYRO needs on the merchant account (ask OMPAY):
 *   - Bank-hosted payments, "Forced Saved Cards" variant (first payment saves the card)
 *   - Card tokenization + merchant-hosted token payments without CVV / OTP
 *   - Refund / reverse
 * TruePay has no webhooks: results are confirmed with POST /transactions/inquiry.
 */

final class OmpayError extends RuntimeException
{
    public function __construct(public string $errorCode, string $message, public int $httpStatus)
    {
        parent::__construct($message);
    }
}

interface Gateway
{
    /** @return array{transaction_id:string,status:string,redirect_url?:string} */
    public function bankHosted(float $amount, string $currency, string $returnUrl, string $reference): array;

    /** @return array{transaction_id:string,status:string,otp_required?:bool,error_message?:?string} */
    public function payWithToken(float $amount, string $currency, string $token, string $returnUrl, string $reference): array;

    /** Authoritative status; pass a transaction id or our reference. */
    public function inquiry(?string $transactionId, ?string $reference): array;

    public function reverse(string $transactionId): void;

    public function refund(string $transactionId): void;
}

final class Ompay implements Gateway
{
    public function __construct(private string $baseUrl, private string $apiKey, private string $apiSecret)
    {
    }

    public static function fromConfig(): self
    {
        $key = (string) cfg('ompay_api_key', '');
        $secret = (string) cfg('ompay_api_secret', '');
        if ($key === '' || $secret === '') {
            fail(503, 'Online payments are not set up yet.');
        }
        return new self((string) cfg('ompay_base_url', 'https://api.sandbox.truepay.ompay.om'), $key, $secret);
    }

    private function call(string $method, string $path, array|stdClass|null $body = null): array
    {
        $ch = curl_init(rtrim($this->baseUrl, '/') . '/api/v1' . $path);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 45,
            CURLOPT_HTTPHEADER => [
                'OMPAY-API-Key: ' . $this->apiKey,
                'OMPAY-API-Secret: ' . $this->apiSecret,
                'Content-Type: application/json',
                'Accept: application/json',
            ],
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
        }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $netError = curl_error($ch);
        curl_close($ch);

        if ($raw === false) {
            // Network failure or timeout: the request may or may not have arrived.
            throw new OmpayError('NETWORK', $netError ?: 'Connection failed', 0);
        }
        $json = json_decode((string) $raw, true);
        if ($status >= 400 || !is_array($json) || ($json['success'] ?? true) === false) {
            throw new OmpayError(
                is_array($json) ? (string) ($json['error'] ?? "HTTP_$status") : "HTTP_$status",
                is_array($json) ? (string) ($json['message'] ?? 'Request failed') : 'Request failed',
                $status,
            );
        }
        return is_array($json['data'] ?? null) ? $json['data'] : [];
    }

    public function bankHosted(float $amount, string $currency, string $returnUrl, string $reference): array
    {
        return $this->call('POST', '/transactions/bank-hosted', [
            'amount' => round($amount, 3),
            'currency' => $currency,
            'return_url' => $returnUrl,
            'reference_number' => $reference,
        ]);
    }

    public function payWithToken(float $amount, string $currency, string $token, string $returnUrl, string $reference): array
    {
        return $this->call('POST', '/transactions/merchant-hosted', [
            'amount' => round($amount, 3),
            'currency' => $currency,
            'token' => $token,
            'return_url' => $returnUrl,
            'reference_number' => $reference,
        ]);
    }

    public function inquiry(?string $transactionId, ?string $reference): array
    {
        return $this->call(
            'POST',
            '/transactions/inquiry',
            $transactionId ? ['transaction_id' => $transactionId] : ['reference_number' => $reference],
        );
    }

    public function reverse(string $transactionId): void
    {
        $this->call('POST', '/transactions/' . rawurlencode($transactionId) . '/reverse', new stdClass());
    }

    public function refund(string $transactionId): void
    {
        $this->call('POST', '/transactions/' . rawurlencode($transactionId) . '/refund', new stdClass());
    }
}
