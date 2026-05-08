<?php
session_start();

// Only allow POST requests for API actions
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Method not allowed. Use POST.']);
    exit;
}

// Set content type for all responses
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Database configuration
$dbConfig = array(
    'host' => getenv('DB_HOST') ?: 'localhost',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    'database' => getenv('DB_NAME') ?: 'final_ai'
);

// Create database connection (without specifying database first)
$conn = new mysqli($dbConfig['host'], $dbConfig['user'], $dbConfig['password']);

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $conn->connect_error]);
    exit;
}

// Create database if it doesn't exist
$conn->query("CREATE DATABASE IF NOT EXISTS `{$dbConfig['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

// Now connect to the specific database
$conn->select_db($dbConfig['database']);

// Set charset to utf8mb4
$conn->set_charset("utf8mb4");

// Helper function to generate salt
function generateSalt() {
    return bin2hex(random_bytes(16));
}

// Helper function to hash password
function hashPassword($password, $salt) {
    // Note: password_hash generates its own salt, so the $salt parameter is not used
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

// Helper function to verify password
function verifyPassword($password, $salt, $hash) {
    return password_verify($password, $hash);
}

// Ensure database schema exists
function ensureDatabaseSchema() {
    global $conn;
    
    $createUsersTable = "
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(255) NOT NULL UNIQUE,
            password_hash CHAR(128) NOT NULL,
            salt CHAR(32) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB;
    ";
    
    $createUserDataTable = "
        CREATE TABLE IF NOT EXISTS user_data (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            data_key VARCHAR(100) NOT NULL,
            data_value TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY user_data_unique (user_id, data_key),
            CONSTRAINT fk_user_data_user FOREIGN KEY (user_id)
                REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB;
    ";
    
    if (!$conn->query($createUsersTable)) {
        error_log("Error creating users table: " . $conn->error);
    }
    
    if (!$conn->query($createUserDataTable)) {
        error_log("Error creating user_data table: " . $conn->error);
    }
}

// Initialize database schema
ensureDatabaseSchema();

// Handle different action types
$action = isset($_POST['action']) ? $_POST['action'] : (isset($_GET['action']) ? $_GET['action'] : '');

if ($action === 'register') {
    handleRegister();
} elseif ($action === 'login') {
    handleLogin();
} elseif ($action === 'logout') {
    handleLogout();
} elseif ($action === 'get-user') {
    getUser();
} elseif ($action === 'test') {
    // Simple test endpoint
    echo json_encode(['status' => 'PHP is working', 'method' => $_SERVER['REQUEST_METHOD']]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid action. Available actions: register, login, logout, get-user, test']);
}

// Register user
function handleRegister() {
    global $conn;
    
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $email = isset($_POST['email']) ? trim(strtolower($_POST['email'])) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    
    if (!$username || !$email || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Username, email, and password are required']);
        return;
    }
    
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid email address']);
        return;
    }
    
    if (strlen($username) > 50 || strlen($email) > 255) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid username or email length']);
        return;
    }
    
    $salt = generateSalt();
    $passwordHash = hashPassword($password, $salt);
    
    if (!$passwordHash) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to hash password']);
        error_log("Password hash failed for user: $username");
        return;
    }
    
    $stmt = $conn->prepare("INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)");
    
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['error' => 'Database prepare failed: ' . $conn->error]);
        error_log("Prepare failed: " . $conn->error);
        return;
    }
    
    $stmt->bind_param("ssss", $username, $email, $passwordHash, $salt);
    
    if ($stmt->execute()) {
        $_SESSION['user_id'] = $stmt->insert_id;
        $_SESSION['username'] = $username;
        
        http_response_code(201);
        echo json_encode([
            'success' => true,
            'userId' => $stmt->insert_id,
            'username' => $username
        ]);
    } else {
        if ($conn->errno === 1062) { // Duplicate entry
            http_response_code(409);
            echo json_encode(['error' => 'Username or email already exists']);
        } else {
            http_response_code(500);
            echo json_encode(['error' => 'Failed to register user: ' . $conn->error]);
            error_log("Execute failed: " . $conn->error);
        }
    }
    
    $stmt->close();
}

// Login user
function handleLogin() {
    global $conn;
    
    $username = isset($_POST['username']) ? trim($_POST['username']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    
    if (!$username || !$password) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password are required']);
        return;
    }
    
    $stmt = $conn->prepare("SELECT id, username, password_hash, salt FROM users WHERE username = ?");
    
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['error' => 'Prepare failed: ' . $conn->error]);
        return;
    }
    
    $stmt->bind_param("s", $username);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($result->num_rows === 0) {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
        $stmt->close();
        return;
    }
    
    $user = $result->fetch_assoc();
    
    if (verifyPassword($password, $user['salt'], $user['password_hash'])) {
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];
        
        echo json_encode([
            'success' => true,
            'userId' => $user['id'],
            'username' => $user['username']
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
    }
    
    $stmt->close();
}

// Logout user
function handleLogout() {
    session_destroy();
    echo json_encode(['success' => true]);
}

// Get current user
function getUser() {
    if (isset($_SESSION['user_id']) && isset($_SESSION['username'])) {
        echo json_encode([
            'userId' => $_SESSION['user_id'],
            'username' => $_SESSION['username']
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Not authenticated']);
    }
}

$conn->close();
?>
