<?php
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Log errors to a file
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/contact_errors.log');


if ($_SERVER["REQUEST_METHOD"] == "POST") {

    // Basic spam protection
    if (!empty($_POST['website'])) {
        die('Spam detected');
    }

    // Validate inputs
    $name = trim(htmlspecialchars($_POST['g8-name']));
    $phone = trim(htmlspecialchars($_POST['g8-phone']));
    $email = filter_var(trim($_POST['g8-email']), FILTER_VALIDATE_EMAIL);
    $message = trim(htmlspecialchars($_POST['g8-typeyourmessage']));

    // Check required fields
    if (empty($name) || empty($message) || !$email) {
        $_SESSION['error'] = 'Please fill in all required fields correctly.';
        header('Location: contact.html');
        exit;
    }

    $to = "sambhav.sehgal.007@gmail.com";
    $subject = "New Contact Form Submission";
    $body = "Name: $name\nPhone: $phone\nEmail: $email\nMessage:\n$message";
    
    // Improved email headers
    $headers = "From: $email\r\n";
    $headers .= "Reply-To: $email\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

    // Try to send the email
    try {
        error_log("Attempting to send email to: $to");
        if (mail($to, $subject, $body, $headers)) {
            error_log("Email sent successfully to: $to");
            $_SESSION['success'] = 'Your message has been sent successfully!';
        } else {
            $lastError = error_get_last();
            error_log("Mail sending failed. Error: " . print_r($lastError, true));
            error_log("Email details - To: $to, Subject: $subject, Body: $body");
            $_SESSION['error'] = 'There was an error sending your message. Please try again later. Error details have been logged.';
        }

    } catch (Exception $e) {
        error_log("Mail sending exception: " . $e->getMessage());
        $_SESSION['error'] = 'A technical error occurred. Please try again later.';
    }

    
    header('Location: contact.html');
    exit;
}
?>
