<?php
// Copy to config.php on the server (the deploy workflow writes it from GitHub
// secrets). config.php is never committed to the repository.
return [
    'db_host' => 'localhost',
    'db_name' => 'DATABASE_NAME',
    'db_user' => 'DATABASE_USER',
    'db_password' => 'DATABASE_PASSWORD',

    'app_url' => 'https://your-domain',          // no trailing slash
    'timezone' => 'Asia/Muscat',                 // where "today" is for billing

    'ompay_base_url' => 'https://api.sandbox.truepay.ompay.om', // production: https://api.truepay.ompay.om
    'ompay_api_key' => '',
    'ompay_api_secret' => '',

    'cron_secret' => 'A_LONG_RANDOM_STRING',     // protects the scheduled jobs
    'email_from' => 'VYRO <billing@your-domain>',
    'admin_emails' => 'you@your-domain',         // comma separated; receive admin notifications
];
