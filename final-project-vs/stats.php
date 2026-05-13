<?php
// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0);

session_start();
ob_start();

// Set content type and CORS headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Database configuration
$dbConfig = array(
    'host' => getenv('DB_HOST') ?: 'localhost',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    'database' => getenv('DB_NAME') ?: 'final_ai'
);

// Create database connection
try {
    $conn = new mysqli($dbConfig['host'], $dbConfig['user'], $dbConfig['password']);

    if ($conn->connect_error) {
        throw new Exception('Database connection failed: ' . $conn->connect_error);
    }

    // Create database if it doesn't exist
    if (!$conn->query("CREATE DATABASE IF NOT EXISTS `{$dbConfig['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")) {
        throw new Exception('Failed to create database: ' . $conn->error);
    }

    // Now connect to the specific database
    if (!$conn->select_db($dbConfig['database'])) {
        throw new Exception('Failed to select database: ' . $conn->error);
    }

    // Set charset to utf8mb4
    if (!$conn->set_charset("utf8mb4")) {
        throw new Exception('Failed to set charset: ' . $conn->error);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database setup failed: ' . $e->getMessage()]);
    exit;
}

// Ensure songs table exists
function ensureSongsTable() {
    global $conn;
    
    $createSongsTable = "
        CREATE TABLE IF NOT EXISTS songs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            artist VARCHAR(255) NOT NULL,
            listens INT NOT NULL DEFAULT 0,
            description TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_song_title_artist (title, artist)
        ) ENGINE=InnoDB;
    ";
    
    if (!$conn->query($createSongsTable)) {
        error_log("Error creating songs table: " . $conn->error);
    }
}

// Initialize database schema
ensureSongsTable();

try {
    getStats();
    $conn->close();
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Unexpected error: ' . $e->getMessage()]);
}

// Clean output buffer
if (ob_get_level() > 0) {
    $content = ob_get_contents();
    ob_end_clean();
    if (!empty($content)) {
        error_log("Buffered output: " . $content);
        echo $content;
    }
}

// Get statistics about songs
function getStats() {
    global $conn;
    
    try {
        $result = $conn->query("
            SELECT
                COUNT(*) AS totalSongs,
                SUM(CAST(listens AS UNSIGNED)) AS totalListens,
                AVG(CAST(listens AS UNSIGNED)) AS avgListens
            FROM songs
        ");
        
        if (!$result) {
            throw new Exception("Query failed: " . $conn->error);
        }
        
        $row = $result->fetch_assoc();
        
        $stats = [
            'totalSongs' => intval($row['totalSongs']),
            'totalListens' => $row['totalListens'] ? intval($row['totalListens']) : 0,
            'avgListens' => $row['avgListens'] ? intval(round($row['avgListens'])) : 0
        ];
        
        echo json_encode($stats);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch stats: ' . $e->getMessage()]);
    }
}
?>
