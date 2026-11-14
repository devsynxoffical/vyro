<?php
/**
 * VYRO API front controller. Every request to /api/... lands here.
 * Kept free of modern syntax so an old PHP version gets a clear message.
 */
if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(array('error' => 'The server needs PHP 8.1 or newer (it is running ' . PHP_VERSION . '). Change it in the hosting control panel.'));
    exit;
}
require __DIR__ . '/lib/app.php';
