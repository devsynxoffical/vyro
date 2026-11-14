<?php
// Router for PHP's built-in server in tests: /api/* -> the API, /uploads/* -> files.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$public = __DIR__ . '/../../../vyro-site/public';
if (str_starts_with($path, '/api/')) {
    require "$public/api/index.php";
    return true;
}
return false;
