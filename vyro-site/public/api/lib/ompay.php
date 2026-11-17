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
        $url = rtrim($this->baseUrl, '/') . '/api/v1' . $path;
        $headers = [
            'OMPAY-API-Key: ' . $this->apiKey,
            'OMPAY-API-Secret: ' . $this->apiSecret,
            'Content-Type: application/json',
            'Accept: application/json',
        ];
        [$raw, $status] = $this->send($method, $url, $headers, $body === null ? null : (string) json_encode($body));

        $json = json_decode($raw, true);
        if ($status >= 400 || !is_array($json) || ($json['success'] ?? true) === false) {
            throw new OmpayError(
                is_array($json) ? (string) ($json['error'] ?? "HTTP_$status") : "HTTP_$status",
                is_array($json) ? (string) ($json['message'] ?? 'Request failed') : 'Request failed',
                $status,
            );
        }
        return is_array($json['data'] ?? null) ? $json['data'] : [];
    }

    /**
     * Sends the request and returns [body, HTTP status].
     *
     * Shared hosting often forbids cURL's background DNS lookup ("getaddrinfo()
     * thread failed to start"). So the address is looked up here first and
     * handed to cURL, and if cURL still cannot even look the host up (the
     * request never left this server) the request is sent with PHP's own HTTP
     * client instead.
     *
     * @return array{0:string,1:int}
     */
    private function send(string $method, string $url, array $headers, ?string $payload): array
    {
        $forceStream = getenv('VYRO_OMPAY_TRANSPORT') === 'stream';
        if (!$forceStream && function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_CUSTOMREQUEST => $method,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 45,
                CURLOPT_HTTPHEADER => $headers,
            ]);
            $host = (string) parse_url($url, PHP_URL_HOST);
            if ($host !== '' && filter_var($host, FILTER_VALIDATE_IP) === false) {
                $ip = gethostbyname($host); // returns the name unchanged when the lookup fails
                if ($ip !== $host) {
                    $port = parse_url($url, PHP_URL_PORT) ?: (parse_url($url, PHP_URL_SCHEME) === 'http' ? 80 : 443);
                    curl_setopt($ch, CURLOPT_RESOLVE, ["$host:$port:$ip"]);
                }
            }
            if ($payload !== null) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
            }
            $raw = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $errno = curl_errno($ch);
            $error = curl_error($ch);
            curl_close($ch);
            if ($raw !== false) {
                return [(string) $raw, $status];
            }
            $neverLeft = in_array($errno, [5, 6], true) || stripos($error, 'getaddrinfo') !== false || stripos($error, 'resolve') !== false;
            if (!$neverLeft) {
                // Timeout or dropped connection: the request may or may not have arrived.
                throw new OmpayError('NETWORK', $error ?: 'Connection failed', 0);
            }
        }
        return $this->sendWithStreams($method, $url, $headers, $payload);
    }

    /** @return array{0:string,1:int} */
    private function sendWithStreams(string $method, string $url, array $headers, ?string $payload): array
    {
        $headers[] = 'Connection: close';
        $context = stream_context_create([
            'http' => [
                'method' => $method,
                'header' => implode("\r\n", $headers),
                'content' => $payload ?? '',
                'timeout' => 45,
                'ignore_errors' => true, // read the body of 4xx/5xx answers too
                'protocol_version' => 1.1,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $http_response_header = [];
        $raw = @file_get_contents($url, false, $context);
        if ($raw === false) {
            throw new OmpayError('NETWORK', (string) (error_get_last()['message'] ?? 'Connection failed'), 0);
        }
        $status = 0;
        foreach ($http_response_header as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                $status = (int) $m[1]; // the last status line wins (after any redirects)
            }
        }
        return [$raw, $status];
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
