<?php
declare(strict_types=1);

/**
 * Applies schema/NNN_*.sql files that have not run yet, in order. Run at every
 * deploy; safe to call repeatedly.
 */
function migrate(): array
{
    db()->exec(
        'CREATE TABLE IF NOT EXISTS migrations (name VARCHAR(100) NOT NULL PRIMARY KEY, applied_at DATETIME NOT NULL)
         ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
    );
    $done = array_column(rows('SELECT name FROM migrations'), 'name');
    $applied = [];
    $files = glob(__DIR__ . '/../schema/*.sql') ?: [];
    sort($files);
    foreach ($files as $file) {
        $name = basename($file);
        if (in_array($name, $done, true)) {
            continue;
        }
        $sql = (string) file_get_contents($file);
        // Strip comments, then run statement by statement (DDL cannot be rolled back in MySQL).
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
        foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $statement) {
            db()->exec(rtrim($statement, ';'));
        }
        q('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$name, now()]);
        $applied[] = $name;
    }
    return $applied;
}
