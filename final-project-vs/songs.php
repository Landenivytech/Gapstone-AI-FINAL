<?php
// Enable error reporting for debugging
error_reporting(E_ALL);
ini_set('display_errors', 0);

session_start();
ob_start();

// Variables to store imported song data from users
$userImportData = [];
$lastImportSummary = '';

// Set content type and CORS headers
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
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
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        handleGetSongs();
    } elseif ($method === 'POST') {
        handlePostSongs();
    } elseif ($method === 'PUT') {
        handlePutSongs();
    } elseif ($method === 'DELETE') {
        handleDeleteSongs();
    } else {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
    }

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

// Handle GET request - fetch all songs
function handleGetSongs() {
    global $conn;
    
    try {
        $result = $conn->query("SELECT id, title, artist, listens, description FROM songs ORDER BY listens DESC");
        
        if (!$result) {
            throw new Exception("Query failed: " . $conn->error);
        }
        
        $songs = [];
        while ($row = $result->fetch_assoc()) {
            $songs[] = $row;
        }
        
        echo json_encode($songs);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to fetch songs: ' . $e->getMessage()]);
    }
}

// Handle POST request - save songs
function handlePostSongs() {
    global $conn;
    global $userImportData;
    global $lastImportSummary;
    
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        $input = [];
    }

    if (isset($_POST['songs'])) {
        $postSongs = json_decode($_POST['songs'], true);
        if (is_array($postSongs)) {
            $input['songs'] = $postSongs;
        }
    }

    if (empty($input['songs']) && isset($_POST['title']) && isset($_POST['artist'])) {
        $input['songs'] = [[
            'title' => $_POST['title'],
            'artist' => $_POST['artist'],
            'listens' => isset($_POST['listens']) ? intval($_POST['listens']) : 0,
            'description' => isset($_POST['description']) ? $_POST['description'] : null
        ]];
    }

    $songs = is_array($input['songs']) ? $input['songs'] : [];
    
    if (empty($songs)) {
        http_response_code(400);
        echo json_encode(['error' => 'No songs provided']);
        return;
    }
    
    try {
        $savedCount = 0;
        $importedSongs = [];
        
        foreach ($songs as $song) {
            $title = isset($song['title']) ? trim($song['title']) : '';
            $artist = isset($song['artist']) ? trim($song['artist']) : '';
            $listens = isset($song['listens']) ? intval($song['listens']) : 0;
            $description = isset($song['description']) ? $song['description'] : null;
            
            if (empty($title) || empty($artist)) {
                continue;
            }
            
            $stmt = $conn->prepare("
                INSERT INTO songs (title, artist, listens, description)
                VALUES (?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    listens = VALUES(listens),
                    description = VALUES(description)
            ");
            
            if (!$stmt) {
                throw new Exception("Prepare failed: " . $conn->error);
            }
            
            $stmt->bind_param("ssis", $title, $artist, $listens, $description);
            
            if ($stmt->execute()) {
                $savedCount++;
                $importedSongs[] = [
                    'title' => $title,
                    'artist' => $artist,
                    'listens' => $listens,
                    'description' => $description
                ];
            }
            
            $stmt->close();
        }
        
        $userImportData = $importedSongs;
        $_SESSION['importedSongs'] = $importedSongs;
        $lastImportSummary = count($importedSongs) . ' song(s) imported';
        
        echo json_encode([
            'success' => true,
            'message' => 'Songs saved successfully',
            'savedCount' => $savedCount,
            'importedSongs' => $importedSongs,
            'importSummary' => $lastImportSummary
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save songs: ' . $e->getMessage()]);
    }
}

// Handle PUT request - update a specific song by title and artist
function handlePutSongs() {
    global $conn;
    
    $input = json_decode(file_get_contents('php://input'), true);
    $title = isset($input['title']) ? trim($input['title']) : '';
    $artist = isset($input['artist']) ? trim($input['artist']) : '';
    $listens = isset($input['listens']) ? intval($input['listens']) : null;
    $description = isset($input['description']) ? $input['description'] : null;
    
    if (empty($title) || empty($artist)) {
        http_response_code(400);
        echo json_encode(['error' => 'Title and artist are required']);
        return;
    }
    
    try {
        // Build dynamic update query based on what fields are provided
        $updates = [];
        $params = [];
        $types = '';
        
        if ($listens !== null) {
            $updates[] = "listens = ?";
            $params[] = $listens;
            $types .= "i";
        }
        
        if ($description !== null) {
            $updates[] = "description = ?";
            $params[] = $description;
            $types .= "s";
        }
        
        if (empty($updates)) {
            http_response_code(400);
            echo json_encode(['error' => 'No fields to update']);
            return;
        }
        
        // Add title and artist to params for WHERE clause
        $params[] = $title;
        $params[] = $artist;
        $types .= "ss";
        
        $query = "UPDATE songs SET " . implode(", ", $updates) . " WHERE title = ? AND artist = ?";
        
        $stmt = $conn->prepare($query);
        if (!$stmt) {
            throw new Exception("Prepare failed: " . $conn->error);
        }
        
        $stmt->bind_param($types, ...$params);
        
        if (!$stmt->execute()) {
            throw new Exception("Execute failed: " . $stmt->error);
        }
        
        if ($stmt->affected_rows === 0) {
            http_response_code(404);
            echo json_encode(['error' => 'Song not found']);
        } else {
            echo json_encode([
                'success' => true,
                'message' => 'Song updated successfully',
                'affectedRows' => $stmt->affected_rows
            ]);
        }
        
        $stmt->close();
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to update song: ' . $e->getMessage()]);
    }
}

// Handle DELETE request - clear all songs
function handleDeleteSongs() {
    global $conn;
    $input = json_decode(file_get_contents('php://input'), true);

    try {
        if (is_array($input) && (!empty($input['id']) || (!empty($input['title']) && !empty($input['artist'])))) {
            if (!empty($input['id'])) {
                $id = intval($input['id']);
                $stmt = $conn->prepare("DELETE FROM songs WHERE id = ?");
                if (!$stmt) {
                    throw new Exception("Prepare failed: " . $conn->error);
                }
                $stmt->bind_param('i', $id);
            } else {
                $title = trim($input['title']);
                $artist = trim($input['artist']);
                $stmt = $conn->prepare("DELETE FROM songs WHERE title = ? AND artist = ?");
                if (!$stmt) {
                    throw new Exception("Prepare failed: " . $conn->error);
                }
                $stmt->bind_param('ss', $title, $artist);
            }

            if (!$stmt->execute()) {
                throw new Exception("Execute failed: " . $stmt->error);
            }

            if ($stmt->affected_rows === 0) {
                http_response_code(404);
                echo json_encode(['error' => 'Song not found']);
            } else {
                echo json_encode([
                    'success' => true,
                    'message' => 'Song deleted successfully',
                    'rowsAffected' => $stmt->affected_rows
                ]);
            }

            $stmt->close();
            return;
        }

        $result = $conn->query("DELETE FROM songs");

        if (!$result) {
            throw new Exception("Delete failed: " . $conn->error);
        }
        
        echo json_encode([
            'success' => true,
            'message' => 'All songs deleted',
            'rowsAffected' => $conn->affected_rows
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete song(s): ' . $e->getMessage()]);
    }
}
?>
