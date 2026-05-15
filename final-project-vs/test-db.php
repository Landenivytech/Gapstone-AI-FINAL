<?php
// Test database connection and update functionality
error_reporting(E_ALL);
ini_set('display_errors', 1);

header('Content-Type: application/json');

$dbConfig = array(
    'host' => getenv('DB_HOST') ?: 'localhost',
    'user' => getenv('DB_USER') ?: 'root',
    'password' => getenv('DB_PASSWORD') ?: '',
    'database' => getenv('DB_NAME') ?: 'final_ai'
);

$results = array(
    'connection' => false,
    'database_selected' => false,
    'table_exists' => false,
    'test_insert' => false,
    'test_update' => false,
    'test_select' => false,
    'errors' => []
);

try {
    // Test connection
    $conn = new mysqli($dbConfig['host'], $dbConfig['user'], $dbConfig['password']);
    if ($conn->connect_error) {
        $results['errors'][] = 'Connection failed: ' . $conn->connect_error;
    } else {
        $results['connection'] = true;
    }

    // Test database selection
    if (!$conn->select_db($dbConfig['database'])) {
        $conn->query("CREATE DATABASE IF NOT EXISTS `{$dbConfig['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $conn->select_db($dbConfig['database']);
    }
    $results['database_selected'] = true;

    // Test table exists
    $tableCheck = $conn->query("SHOW TABLES LIKE 'songs'");
    $results['table_exists'] = ($tableCheck && $tableCheck->num_rows > 0);

    if (!$results['table_exists']) {
        $createTable = "CREATE TABLE IF NOT EXISTS songs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            artist VARCHAR(255) NOT NULL,
            listens INT NOT NULL DEFAULT 0,
            description TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_song_title_artist (title, artist)
        ) ENGINE=InnoDB";
        if ($conn->query($createTable)) {
            $results['table_exists'] = true;
        } else {
            $results['errors'][] = 'Failed to create table: ' . $conn->error;
        }
    }

    // Test insert
    $testSong = array(
        'title' => 'Test Song ' . time(),
        'artist' => 'Test Artist',
        'listens' => 100,
        'description' => 'Test Description'
    );

    $stmt = $conn->prepare("INSERT INTO songs (title, artist, listens, description) VALUES (?, ?, ?, ?)");
    if ($stmt) {
        $stmt->bind_param("ssis", $testSong['title'], $testSong['artist'], $testSong['listens'], $testSong['description']);
        $results['test_insert'] = $stmt->execute();
        if (!$results['test_insert']) {
            $results['errors'][] = 'Insert failed: ' . $stmt->error;
        }
        $stmt->close();
    } else {
        $results['errors'][] = 'Prepare insert failed: ' . $conn->error;
    }

    // Test update
    $updateListens = 500;
    $stmt = $conn->prepare("UPDATE songs SET listens = ? WHERE title = ? AND artist = ?");
    if ($stmt) {
        $stmt->bind_param("iss", $updateListens, $testSong['title'], $testSong['artist']);
        $results['test_update'] = $stmt->execute();
        if (!$results['test_update']) {
            $results['errors'][] = 'Update failed: ' . $stmt->error;
        }
        $stmt->close();
    } else {
        $results['errors'][] = 'Prepare update failed: ' . $conn->error;
    }

    // Test select
    $stmt = $conn->prepare("SELECT id, title, artist, listens, description FROM songs WHERE title = ? AND artist = ?");
    if ($stmt) {
        $stmt->bind_param("ss", $testSong['title'], $testSong['artist']);
        $stmt->execute();
        $result = $stmt->get_result();
        if ($result && $result->num_rows > 0) {
            $row = $result->fetch_assoc();
            $results['test_select'] = true;
            $results['selected_song'] = $row;
            if ($row['listens'] != $updateListens) {
                $results['errors'][] = 'Update verification failed: listens not updated to ' . $updateListens;
            }
        } else {
            $results['errors'][] = 'Select failed: no rows returned';
        }
        $stmt->close();
    } else {
        $results['errors'][] = 'Prepare select failed: ' . $conn->error;
    }

    // Clean up test data
    $conn->query("DELETE FROM songs WHERE title LIKE 'Test Song%'");

    $conn->close();
} catch (Exception $e) {
    $results['errors'][] = 'Exception: ' . $e->getMessage();
}

echo json_encode($results, JSON_PRETTY_PRINT);
?>
