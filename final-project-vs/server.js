const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'final_ai',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, salt, hash) {
    try {
        return hashPassword(password, salt) === hash;
    } catch (error) {
        return false;
    }
}

async function ensureDatabaseSchema() {
    const connection = await pool.getConnection();
    try {
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash CHAR(128) NOT NULL,
                salt CHAR(32) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        await connection.execute(`
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
        `);

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS songs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                artist VARCHAR(255) NOT NULL,
                listens INT NOT NULL DEFAULT 0,
                description TEXT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_song_title_artist (title, artist)
            ) ENGINE=InnoDB;
        `);
    } finally {
        connection.release();
    }
}

async function queryDatabase(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

app.get('/api/songs', async (req, res) => {
    try {
        const songs = await queryDatabase(
            'SELECT id, title, artist, listens, description FROM songs ORDER BY listens DESC'
        );
        res.json(songs);
    } catch (error) {
        console.error('Failed to fetch songs:', error);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanUsername || !cleanEmail || cleanUsername.length > 50 || cleanEmail.length > 255) {
        return res.status(400).json({ error: 'Invalid username or email' });
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(password, salt);

    try {
        const [result] = await pool.execute(
            `INSERT INTO users (username, email, password_hash, salt)
             VALUES (?, ?, ?, ?)`,
            [cleanUsername, cleanEmail, passwordHash, salt]
        );

        res.status(201).json({
            userId: result.insertId,
            username: cleanUsername
        });
    } catch (error) {
        console.error('Failed to register user:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username or email already exists' });
        }
        res.status(500).json({ error: 'Failed to register user' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const [rows] = await pool.execute(
            'SELECT id, username, password_hash, salt FROM users WHERE username = ?',
            [username.trim()]
        );

        if (!rows.length) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = rows[0];
        if (!verifyPassword(password, user.salt, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ userId: user.id, username: user.username });
    } catch (error) {
        console.error('Failed to authenticate user:', error);
        res.status(500).json({ error: 'Failed to authenticate user' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await queryDatabase(
            'SELECT id, username, email, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(users);
    } catch (error) {
        console.error('Failed to fetch users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.get('/api/users/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        const [rows] = await pool.execute(
            'SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?',
            [userId]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Failed to fetch user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

app.post('/api/users/:userId/data', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const { key, value } = req.body;

    if (Number.isNaN(userId) || !key) {
        return res.status(400).json({ error: 'Invalid user ID or key' });
    }

    try {
        await pool.execute(
            `INSERT INTO user_data (user_id, data_key, data_value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE data_value = VALUES(data_value), updated_at = CURRENT_TIMESTAMP`,
            [userId, key, value || null]
        );
        res.json({ success: true, message: 'User data saved' });
    } catch (error) {
        console.error('Failed to save user data:', error);
        res.status(500).json({ error: 'Failed to save user data' });
    }
});

app.get('/api/users/:userId/data', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        const rows = await queryDatabase(
            'SELECT data_key AS key, data_value AS value FROM user_data WHERE user_id = ?',
            [userId]
        );
        res.json(rows);
    } catch (error) {
        console.error('Failed to fetch user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

app.get('/api/users/:userId/data/:key', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const { key } = req.params;

    if (Number.isNaN(userId) || !key) {
        return res.status(400).json({ error: 'Invalid user ID or key' });
    }

    try {
        const [rows] = await pool.execute(
            'SELECT data_key AS key, data_value AS value FROM user_data WHERE user_id = ? AND data_key = ?',
            [userId, key]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Data not found' });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error('Failed to fetch user data item:', error);
        res.status(500).json({ error: 'Failed to fetch user data item' });
    }
});

app.delete('/api/users/:userId/data/:key', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const { key } = req.params;

    if (Number.isNaN(userId) || !key) {
        return res.status(400).json({ error: 'Invalid user ID or key' });
    }

    try {
        const [result] = await pool.execute(
            'DELETE FROM user_data WHERE user_id = ? AND data_key = ?',
            [userId, key]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Data not found' });
        }

        res.json({ success: true, message: 'User data deleted' });
    } catch (error) {
        console.error('Failed to delete user data item:', error);
        res.status(500).json({ error: 'Failed to delete user data item' });
    }
});

app.post('/api/songs', async (req, res) => {
    const songs = Array.isArray(req.body.songs) ? req.body.songs : [];

    if (!songs.length) {
        return res.status(400).json({ error: 'No songs provided' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        for (const song of songs) {
            const title = (song.title || '').trim();
            const artist = (song.artist || '').trim();
            const listens = Number(song.listens) || 0;
            const description = song.description || null;

            if (!title || !artist) {
                continue;
            }

            await connection.execute(
                `INSERT INTO songs (title, artist, listens, description)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                     listens = VALUES(listens),
                     description = VALUES(description)`,
                [title, artist, listens, description]
            );
        }

        await connection.commit();
        res.json({ success: true, message: 'Songs saved successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('Failed to save songs:', error);
        res.status(500).json({ error: 'Failed to save songs' });
    } finally {
        connection.release();
    }
});

app.delete('/api/songs', async (req, res) => {
    try {
        const result = await queryDatabase('DELETE FROM songs');
        res.json({ success: true, message: 'All songs deleted', rowsAffected: result.affectedRows || 0 });
    } catch (error) {
        console.error('Failed to clear songs:', error);
        res.status(500).json({ error: 'Failed to clear songs' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const [stats] = await queryDatabase(
            `SELECT
                COUNT(*) AS totalSongs,
                COALESCE(SUM(listens), 0) AS totalListens,
                COALESCE(ROUND(AVG(listens)), 0) AS avgListens
             FROM songs`
        );
        res.json(stats || { totalSongs: 0, totalListens: 0, avgListens: 0 });
    } catch (error) {
        console.error('Failed to fetch stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

app.put('/api/songs/:songId', async (req, res) => {
    const songId = parseInt(req.params.songId, 10);
    if (Number.isNaN(songId)) {
        return res.status(400).json({ error: 'Invalid song ID' });
    }

    const title = req.body.title ? req.body.title.trim() : null;
    const artist = req.body.artist ? req.body.artist.trim() : null;
    const listens = req.body.listens !== undefined ? Number(req.body.listens) : null;
    const description = req.body.description !== undefined ? req.body.description : null;

    const updates = [];
    const values = [];

    if (title !== null && title !== '') {
        updates.push('title = ?');
        values.push(title);
    }
    if (artist !== null && artist !== '') {
        updates.push('artist = ?');
        values.push(artist);
    }
    if (listens !== null && !Number.isNaN(listens)) {
        updates.push('listens = ?');
        values.push(listens);
    }
    if (description !== null) {
        updates.push('description = ?');
        values.push(description);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    values.push(songId);

    try {
        const result = await queryDatabase(
            `UPDATE songs SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Song not found' });
        }

        res.json({ success: true, message: 'Song updated successfully' });
    } catch (error) {
        console.error('Failed to update song:', error);
        res.status(500).json({ error: 'Failed to update song' });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

(async function startServer() {
    try {
        await ensureDatabaseSchema();
        await pool.getConnection();
        console.log('Connected to MySQL database.');
        app.listen(PORT, () => {
            console.log(`Server listening on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
})();
