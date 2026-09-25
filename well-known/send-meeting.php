<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || empty($data['name']) || empty($data['email'])) {
    echo json_encode(['success' => false, 'error' => 'Name and email are required']);
    exit;
}

$name = htmlspecialchars($data['name'] ?? '');
$email = filter_var($data['email'] ?? '', FILTER_SANITIZE_EMAIL);
$phone = isset($data['phone']) && !empty($data['phone']) ? htmlspecialchars($data['phone']) : 'Not provided';
$goal = isset($data['goal']) && !empty($data['goal']) ? htmlspecialchars($data['goal']) : 'Meeting Request';
$date = isset($data['date']) && !empty($data['date']) ? htmlspecialchars($data['date']) : 'Flexible';
$time = isset($data['time']) && !empty($data['time']) ? htmlspecialchars($data['time']) : 'Flexible';
$message = isset($data['message']) && !empty($data['message']) ? htmlspecialchars($data['message']) : 'None';

$subject = "New Meeting Request: {$goal} - {$name}";
$body = "You received a new meeting request from the Vyro website.\n\n"
      . "----------------------------------------\n"
      . "Name:           {$name}\n"
      . "Email:          {$email}\n"
      . "Phone:          {$phone}\n"
      . "Meeting Goal:   {$goal}\n"
      . "Preferred Date: {$date}\n"
      . "Best Time:      {$time}\n"
      . "----------------------------------------\n"
      . "Additional Message:\n{$message}\n\n"
      . "Submitted on: " . date('Y-m-d H:i:s') . " (UTC)\n";

$smtpHost = 'ssl://mail.vyroes.tech';
$smtpPort = 465;
$smtpUser = 'info@vyroes.tech';
$smtpPass = '6R{j4]gk{Q}Ctksa';
$to = 'info@vyroes.tech';

function sendSmtpMail($smtpHost, $smtpPort, $smtpUser, $smtpPass, $to, $fromEmail, $fromName, $subject, $body) {
    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        ]
    ]);
    
    $socket = @stream_socket_client($smtpHost . ':' . $smtpPort, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        return false;
    }

    $read = function() use ($socket) {
        $data = "";
        while ($str = fgets($socket, 515)) {
            $data .= $str;
            if (substr($str, 3, 1) == " ") break;
        }
        return $data;
    };

    $write = function($cmd) use ($socket) {
        fputs($socket, $cmd . "\r\n");
    };

    $read();
    $write("EHLO vyroes.tech");
    $read();
    $write("AUTH LOGIN");
    $read();
    $write(base64_encode($smtpUser));
    $read();
    $write(base64_encode($smtpPass));
    $authRes = $read();
    if (strpos($authRes, '235') === false) {
        fclose($socket);
        return false;
    }

    $write("MAIL FROM: <{$smtpUser}>");
    $read();
    $write("RCPT TO: <{$to}>");
    $read();
    $write("DATA");
    $read();

    $headers  = "From: =?UTF-8?B?" . base64_encode("Vyro Meetings") . "?= <{$smtpUser}>\r\n";
    $headers .= "Reply-To: {$fromName} <{$fromEmail}>\r\n";
    $headers .= "To: <{$to}>\r\n";
    $headers .= "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\n";
    $headers .= "Date: " . date('r') . "\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $headers .= "Content-Transfer-Encoding: 8bit\r\n";

    $write($headers . "\r\n" . $body . "\r\n.");
    $res = $read();
    $write("QUIT");
    fclose($socket);

    return (strpos($res, '250') !== false);
}

$sent = sendSmtpMail($smtpHost, $smtpPort, $smtpUser, $smtpPass, $to, $email, $name, $subject, $body);

if (!$sent) {
    $fallbackHeaders = "From: info@vyroes.tech\r\n" .
                       "Reply-To: {$email}\r\n" .
                       "X-Mailer: PHP/" . phpversion();
    $sent = @mail($to, $subject, $body, $fallbackHeaders);
}

if ($sent) {
    echo json_encode(['success' => true]);
} else {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Unable to send email.']);
}
