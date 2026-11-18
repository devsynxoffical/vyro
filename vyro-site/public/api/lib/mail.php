<?php
declare(strict_types=1);

/**
 * Every email VYRO sends: one branded layout (the website's dark theme, logo
 * and pink-violet-blue gradient) with a plain-text copy for mail programs
 * that do not show HTML.
 *
 * A "view" describes one email:
 *   heading  string            the headline
 *   body     string            plain text; blank lines separate paragraphs
 *   tone     ok|warn|bad|null  coloured label above the headline
 *   label    string            text of that label
 *   rows     [[label, value]]  a small table of facts
 *   button   [label, url]      the main action
 *   note     string            small print under the button
 */

const MAIL_TONES = [
    'ok' => ['#4ade80', '#0f2a1c'],
    'warn' => ['#fbbf24', '#2e2208'],
    'bad' => ['#ff7a8a', '#35121a'],
];

function mail_html(array $v): string
{
    $h = fn (?string $s) => htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $font = "'Inter','Segoe UI',Helvetica,Arial,sans-serif";
    $display = "'Sora','Inter','Segoe UI',Helvetica,Arial,sans-serif";
    $site = app_url();
    $host = (string) (parse_url($site, PHP_URL_HOST) ?: 'vyro');

    $label = '';
    if (!empty($v['tone']) && !empty($v['label']) && isset(MAIL_TONES[$v['tone']])) {
        [$ink, $soft] = MAIL_TONES[$v['tone']];
        $label = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>'
            . "<td bgcolor=\"$soft\" style=\"background:$soft;border-radius:999px;padding:5px 12px;font:600 12px/1.3 $font;color:$ink;letter-spacing:.02em\">"
            . $h($v['label']) . '</td></tr></table>';
    }

    $paragraphs = '';
    foreach (preg_split('/\n\s*\n/', trim((string) ($v['body'] ?? ''))) ?: [] as $p) {
        if (trim($p) !== '') {
            $paragraphs .= "<p style=\"margin:0 0 14px;font:400 15px/1.6 $font;color:#cfccdb\">" . nl2br($h(trim($p))) . '</p>';
        }
    }

    $rows = '';
    foreach ($v['rows'] ?? [] as [$k, $val]) {
        $rows .= '<tr>'
            . "<td style=\"padding:11px 16px;border-top:1px solid #24212f;font:400 13px/1.4 $font;color:#a9a6ba;white-space:nowrap\">" . $h((string) $k) . '</td>'
            . "<td align=\"right\" style=\"padding:11px 16px;border-top:1px solid #24212f;font:600 14px/1.4 $font;color:#ffffff\">" . $h((string) $val) . '</td>'
            . '</tr>';
    }
    if ($rows !== '') {
        // The first row needs no line above it.
        $rows = preg_replace('/border-top:1px solid #24212f;/', '', $rows, 2);
        $rows = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0a12" '
            . 'style="background:#0b0a12;border:1px solid #24212f;border-radius:10px;margin:6px 0 20px">' . $rows . '</table>';
    }

    $button = '';
    if (!empty($v['button'])) {
        [$text, $url] = $v['button'];
        $button = '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px"><tr>'
            . '<td bgcolor="#8b5cf6" style="background:#8b5cf6;background-image:linear-gradient(115deg,#ff6ec7 0%,#8b5cf6 50%,#4f9dff 100%);border-radius:10px">'
            . '<a href="' . $h($url) . "\" style=\"display:inline-block;padding:13px 26px;font:600 15px/1 $font;color:#ffffff;text-decoration:none\">" . $h($text) . '</a>'
            . '</td></tr></table>'
            . "<p style=\"margin:14px 0 0;font:400 12px/1.5 $font;color:#a9a6ba\">If the button does not work, open this link:<br>"
            . '<a href="' . $h($url) . '" style="color:#c9b6ff;word-break:break-all">' . $h($url) . '</a></p>';
    }

    $note = empty($v['note']) ? ''
        : "<p style=\"margin:18px 0 0;font:400 13px/1.55 $font;color:#a9a6ba\">" . nl2br($h($v['note'])) . '</p>';

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
        . '<title>' . $h($v['heading'] ?? 'VYRO') . '</title></head>'
        . '<body style="margin:0;padding:0;background:#07060b" bgcolor="#07060b">'
        . '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#07060b">' . $h(mb_substr(trim((string) ($v['body'] ?? '')), 0, 120)) . '</div>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#07060b" style="background:#07060b"><tr><td align="center" style="padding:28px 12px">'
        . '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">'
        // logo band
        . '<tr><td align="center" bgcolor="#0a0a0a" style="background:#0a0a0a;border-radius:14px 14px 0 0;padding:14px 0 10px">'
        . '<a href="' . $h($site) . '"><img src="' . $h($site) . '/brand/email-logo.png" width="220" height="73" alt="VYRO" '
        . "style=\"display:block;border:0;width:220px;height:auto;font:700 26px/1 $display;color:#ffffff\"></a></td></tr>"
        // gradient line
        . '<tr><td height="4" bgcolor="#8b5cf6" style="height:4px;font-size:0;line-height:0;background:#8b5cf6;background-image:linear-gradient(90deg,#ff6ec7 0%,#8b5cf6 50%,#4f9dff 100%)">&nbsp;</td></tr>'
        // card
        . '<tr><td bgcolor="#110f1a" style="background:#110f1a;border:1px solid #24212f;border-top:0;border-radius:0 0 14px 14px;padding:30px 28px 28px">'
        . $label
        . "<h1 style=\"margin:0 0 14px;font:600 23px/1.25 $display;color:#ffffff\">" . $h($v['heading'] ?? '') . '</h1>'
        . $paragraphs . $rows . $button . $note
        . '</td></tr>'
        // footer
        . "<tr><td align=\"center\" style=\"padding:22px 16px 0;font:400 12px/1.6 $font;color:#a9a6ba\">"
        . 'VYRO &middot; Virtual try-on for online stores<br>'
        . '<a href="' . $h($site) . '" style="color:#c9b6ff;text-decoration:none">' . $h($host) . '</a>'
        . ' &nbsp;&middot;&nbsp; <a href="' . $h($site) . '/login" style="color:#c9b6ff;text-decoration:none">Sign in</a><br>'
        . '<span style="color:#6f6c80">You are receiving this because you have a VYRO account.</span>'
        . '</td></tr></table></td></tr></table></body></html>';
}

function mail_text(array $v): string
{
    $out = trim((string) ($v['heading'] ?? '')) . "\n\n" . trim((string) ($v['body'] ?? ''));
    foreach ($v['rows'] ?? [] as [$k, $val]) {
        $out .= "\n$k: $val";
    }
    if (!empty($v['button'])) {
        $out .= "\n\n{$v['button'][0]}: {$v['button'][1]}";
    }
    if (!empty($v['note'])) {
        $out .= "\n\n" . $v['note'];
    }
    return trim($out) . "\n\n-- \nVYRO · " . app_url() . "\n";
}

function send_mail(string $to, string $subject, array $view): bool
{
    $view['heading'] ??= $subject;
    $text = mail_text($view);
    $html = mail_html($view);
    $from = (string) cfg('email_from', 'VYRO <no-reply@' . (parse_url(app_url(), PHP_URL_HOST) ?: 'localhost') . '>');
    $from = (string) preg_replace('/[\r\n]+/', ' ', $from);
    if (getenv('VYRO_TEST')) {
        file_put_contents(sys_get_temp_dir() . '/vyro-mail.log', json_encode(compact('to', 'subject', 'text', 'html')) . "\n", FILE_APPEND);
        return true;
    }
    $boundary = 'vyro-' . bin2hex(random_bytes(12));
    $part = fn (string $type, string $content) => "--$boundary\r\nContent-Type: $type; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($content), 76, "\r\n");
    $body = $part('text/plain', $text) . $part('text/html', $html) . "--$boundary--\r\n";
    $headers = "From: $from\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$boundary\"";
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
}

/** How a dashboard notification looks as an email. */
function notification_view(array $n): array
{
    $admin = $n['audience'] === 'admin';
    $kinds = [
        'payment_succeeded' => ['ok', 'Payment received'],
        'reactivated' => ['ok', 'Back on'],
        'registered' => ['ok', 'New registration'],
        'cancel_reverted' => ['ok', 'Subscription resumed'],
        'duplicate_refunded' => ['ok', 'Refunded'],
        'card_removed' => ['warn', 'Card removed'],
        'renewal_reminder' => ['warn', 'Upcoming renewal'],
        'cancel_requested' => ['warn', 'Cancellation'],
        'cancelled' => ['warn', 'Subscription ended'],
        'payment_failed' => ['bad', 'Payment failed'],
        'suspended' => ['bad', 'Service paused'],
        'refund_needed' => ['bad', 'Action needed'],
        'card_not_saved' => ['bad', 'Action needed'],
    ];
    [$tone, $label] = $kinds[$n['kind']] ?? [null, null];
    $view = ['heading' => $n['title'], 'body' => (string) ($n['body'] ?? ''), 'tone' => $tone, 'label' => $label, 'rows' => []];
    if ($admin) {
        $client = $n['company_id'] ? val('SELECT COALESCE(store_name, name) FROM companies WHERE id = ?', [$n['company_id']]) : null;
        if ($client) {
            $view['rows'][] = ['Client', (string) $client];
        }
        $view['button'] = $n['company_id']
            ? ['View client', app_url() . '/admin/clients/' . $n['company_id']]
            : ['Open admin console', app_url() . '/admin'];
    } else {
        $view['button'] = match ($n['kind']) {
            'payment_failed', 'suspended' => ['Pay now', app_url() . '/portal/billing'],
            'payment_succeeded', 'duplicate_refunded' => ['View invoices', app_url() . '/portal/billing'],
            'renewal_reminder' => ['Review billing', app_url() . '/portal/billing'],
            default => ['Open dashboard', app_url() . '/portal'],
        };
        if (in_array($n['kind'], ['payment_failed', 'suspended', 'renewal_reminder'], true)) {
            $view['note'] = 'Payments are made on OMPAY\'s secure page. VYRO never sees or stores your card number.';
        }
    }
    return $view;
}
