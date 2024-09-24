// populatedb.js


const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');


// Placeholder for the database file name
const dbFileName = 'your_database_file.db';


async function initializeDB() {
    const db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });


    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL
        );


        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL
        );
    `);


    // Sample data - Replace these arrays with your own data
    const users = [
        { username: 'user1', hashedGoogleId: 'hashedGoogleId1', avatar_url: '', memberSince: '2024-01-01 12:00:00' },
        { username: 'user2', hashedGoogleId: 'hashedGoogleId2', avatar_url: '', memberSince: '2024-01-02 12:00:00' }
    ];


    const posts = [
        { title: 'First Post', content: 'This is the first post', username: 'user1', timestamp: '2024-01-01 12:30:00', likes: 0 },
        { title: 'Second Post', content: 'This is the second post', username: 'user2', timestamp: '2024-01-02 12:30:00', likes: 0 }
    ];


    // Function to insert user if it doesn't exist
    async function insertUserIfNotExists(user) {
        const existingUser = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', [user.hashedGoogleId]);
        if (!existingUser) {
            await db.run(
                'INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)',
                [user.username, user.hashedGoogleId, user.avatar_url, user.memberSince]
            );
            console.log(`User ${user.username} inserted.`);
        } else {
            console.log(`User ${user.username} already exists. Skipping insert.`);
        }
    }


    // Function to insert post if it doesn't exist
    async function insertPostIfNotExists(post) {
        const existingPost = await db.get('SELECT * FROM posts WHERE title = ? AND username = ?', [post.title, post.username]);
        if (!existingPost) {
            await db.run(
                'INSERT INTO posts (title, content, username, timestamp, likes) VALUES (?, ?, ?, ?, ?)',
                [post.title, post.content, post.username, post.timestamp, post.likes]
            );
            console.log(`Post titled "${post.title}" inserted.`);
        } else {
            console.log(`Post titled "${post.title}" already exists. Skipping insert.`);
        }
    }


    // Insert sample data into the database
    await Promise.all(users.map(insertUserIfNotExists));
    await Promise.all(posts.map(insertPostIfNotExists));


    console.log('Database populated with initial data.');
    await db.close();
}


initializeDB().catch(err => {
    console.error('Error initializing database:', err);
});
