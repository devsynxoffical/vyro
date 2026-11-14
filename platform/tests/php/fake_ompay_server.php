<?php
// A stand-in for OMPAY TruePay over real HTTP, so tests exercise the real
// client code. State lives in a JSON file. Extra "/_test/*" routes play the
// part of the customer on OMPAY's hosted page.
$file = getenv('FAKE_OMPAY_STATE');
$state = is_file($file) ? json_decode(file_get_contents($file), true) : ['tx' => [], 'n' => 0, 'mode' => 'ok', 'reversed' => [], 'token_charges' => []];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$body = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
$save = function () use (&$state, $file) {
    file_put_contents($file, json_encode($state), LOCK_EX);
};
$out = function (array $data, int $status = 200) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
};
if (str_starts_with($path, '/_test/')) {
    if ($path === '/_test/complete') {
        $id = $body['id'];
        $state['tx'][$id]['status'] = $body['ok'] ? 'SUCCESSFUL' : 'FAILED';
        if ($body['ok'] && !empty($body['token'])) {
            $state['tx'][$id]['saved_card'] = ['token' => $body['token'], 'brand' => 'VISA', 'masked_pan' => '464156******3343'];
        }
    } elseif ($path === '/_test/mode') {
        $state['mode'] = $body['mode'];
    }
    $save();
    $out($state);
}
if (($_SERVER['HTTP_OMPAY_API_KEY'] ?? '') !== 'test-key' || ($_SERVER['HTTP_OMPAY_API_SECRET'] ?? '') !== 'test-secret') {
    $out(['success' => false, 'error' => 'INVALID_CREDENTIALS', 'message' => 'bad keys'], 401);
}
if ($path === '/api/v1/transactions/bank-hosted') {
    $id = 'tx' . ++$state['n'];
    $state['tx'][$id] = ['transaction_id' => $id, 'reference_number' => $body['reference_number'], 'status' => 'PROCESSING', 'amount' => $body['amount'], 'return_url' => $body['return_url'] ?? null];
    $save();
    $out(['success' => true, 'data' => ['transaction_id' => $id, 'status' => 'PROCESSING', 'redirect_url' => "http://ompay.test/pay/$id"]]);
}
if ($path === '/api/v1/transactions/merchant-hosted') {
    $id = 'tx' . ++$state['n'];
    $status = $state['mode'] === 'decline' ? 'FAILED' : 'SUCCESSFUL';
    $state['tx'][$id] = ['transaction_id' => $id, 'reference_number' => $body['reference_number'], 'status' => $status, 'amount' => $body['amount']];
    $state['token_charges'][] = ['amount' => $body['amount'], 'token' => $body['token']];
    $save();
    $out(['success' => true, 'data' => ['transaction_id' => $id, 'status' => $status, 'otp_required' => false,
        'error_message' => $status === 'FAILED' ? 'Insufficient funds' : null]]);
}
if ($path === '/api/v1/transactions/inquiry') {
    foreach ($state['tx'] as $t) {
        if (($body['transaction_id'] ?? null) === $t['transaction_id'] || ($body['reference_number'] ?? null) === $t['reference_number']) {
            $out(['success' => true, 'data' => $t + ['token' => $t['saved_card']['token'] ?? null]]);
        }
    }
    $out(['success' => false, 'error' => 'TRANSACTION_NOT_FOUND', 'message' => 'nf'], 404);
}
if (preg_match('#^/api/v1/transactions/([^/]+)/(reverse|refund)$#', $path, $m)) {
    $state['reversed'][] = $m[1];
    $save();
    $out(['success' => true, 'data' => ['refunded' => true]]);
}
$out(['success' => false, 'error' => 'NOT_FOUND', 'message' => $path], 404);
