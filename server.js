const express = require('express');
const expressHandlebars = require('express-handlebars');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const dotenv = require('dotenv');
const multer = require('multer');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const PORT = 3000;
const dbFileName = 'your_database_file.db';

let db;

(async () => {
    db = await sqlite.open({ filename: dbFileName, driver: sqlite3.Database });

    // Ensure the database schema matches `populatedb.js`
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            hashedGoogleId TEXT NOT NULL UNIQUE,
            avatar_url TEXT,
            memberSince DATETIME NOT NULL,
            background_url TEXT
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            username TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            likes INTEGER NOT NULL,
            filePath TEXT
        );
    `);

    // Check and add background_url column if it does not exist
    const userTableColumns = await db.all("PRAGMA table_info(users)");
    const userColumns = userTableColumns.map(row => row.name);
    if (!userColumns.includes("background_url")) {
        await db.run("ALTER TABLE users ADD COLUMN background_url TEXT");
    }

    // Check and add filePath column to posts table if it does not exist
    const postTableColumns = await db.all("PRAGMA table_info(posts)");
    const postColumns = postTableColumns.map(row => row.name);
    if (!postColumns.includes("filePath")) {
        await db.run("ALTER TABLE posts ADD COLUMN filePath TEXT");
    }
})();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const filePath = `/uploads/${req.file.filename}`;
    console.log('File uploaded to:', filePath);
    res.render('uploadSuccess', { filePath });
});

async function addPost(title, content, username, filePath) {
    const timestamp = new Date().toISOString();
    await db.run('INSERT INTO posts (title, content, username, timestamp, likes, filePath) VALUES (?, ?, ?, ?, ?, ?)', title, content, username, timestamp, 0, filePath);
}

app.engine('handlebars', expressHandlebars.engine({
    layoutsDir: path.join(__dirname, 'views/layouts'),
    defaultLayout: 'main',
    extname: '.handlebars',
    helpers: {
        toLowerCase: function (str) {
            return str.toLowerCase();
        },
        ifCond: function (v1, v2, options) {
            if (v1 === v2) {
                return options.fn(this);
            }
            return options.inverse(this);
        },
    }
}));

app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

app.use(
    session({
        secret: 'oneringtorulethemall',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
    })
);

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: `http://localhost:${PORT}/auth/google/callback`
}, async (token, tokenSecret, profile, done) => {
    try {
        let user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', profile.id);
        if (!user) {
            const memberSince = new Date().toISOString();
            await db.run('INSERT INTO users (username, hashedGoogleId, memberSince) VALUES (?, ?, ?)', profile.id, profile.id, memberSince);
            user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', profile.id);
        }
        return done(null, user);
    } catch (err) {
        return done(err);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', id);
        if (!user) {
            return done(new Error('User not found'));
        }
        done(null, user);
    } catch (err) {
        done(err);
    }
});

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        console.log('User is authenticated');
        return next();
    } else {
        console.log('User is not authenticated');
        res.status(401).send('Unauthorized');
    }
}

app.use((req, res, next) => {
    res.locals.appName = 'Connected With Us';
    res.locals.loggedIn = req.isAuthenticated();
    res.locals.userId = req.user ? req.user.id : '';
    next();
});

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

async function findUserByUsername(username) {
    return db.get('SELECT * FROM users WHERE username = ?', username);
}

async function findUserById(userId) {
    return db.get('SELECT * FROM users WHERE id = ?', userId);
}

async function addUser(username, hashedGoogleId) {
    const memberSince = new Date().toISOString();
    await db.run('INSERT INTO users (username, hashedGoogleId, avatar_url, memberSince) VALUES (?, ?, ?, ?)', username, hashedGoogleId, '', memberSince);
}

async function getPosts() {
    return db.all('SELECT * FROM posts ORDER BY timestamp DESC');
}

async function updatePostLikes(postId) {
    await db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', postId);
}

async function getCommentsByPostId(postId) {
    return db.all('SELECT * FROM comments WHERE postId = ? ORDER BY timestamp DESC', postId);
}

async function addComment(postId, username, content) {
    const timestamp = new Date().toISOString();
    await db.run('INSERT INTO comments (postId, username, content, timestamp) VALUES (?, ?, ?, ?)', postId, username, content, timestamp);
}

app.get('/', async (req, res) => {
    const posts = await getPosts();
    const user = req.user ? await findUserById(req.user.id) : {};
    res.render('home', { posts, user, loggedIn: req.isAuthenticated() });
});

app.get('/register', (req, res) => {
    res.render('loginRegister', { regError: req.query.error });
});

app.get('/login', (req, res) => {
    res.render('loginRegister', { loginError: req.query.error });
});

app.get('/error', (req, res) => {
    res.render('error');
});

app.get('/main', async (req, res) => {
    const loggedIn = req.isAuthenticated();
    const user = loggedIn ? await findUserById(req.user.id) : undefined;
    res.render('main', { loggedIn, user });
});

app.get('/post/:id', async (req, res) => {
    const postId = parseInt(req.params.id);
    const post = await db.get('SELECT * FROM posts WHERE id = ?', postId);
    if (!post) {
        res.redirect('/error');
        return;
    }
    const comments = await getCommentsByPostId(postId);
    res.render('postDetail', { post, comments, loggedIn: req.isAuthenticated() });
});

app.post('/posts', async (req, res) => {
    const { title, content } = req.body;
    const user = await findUserById(req.user.id);
    if (!user) {
        res.redirect('/error');
        return;
    }
    await addPost(title, content, user.username);
    res.redirect('/');
});

app.post('/like/:id', async (req, res) => {
    const postId = parseInt(req.params.id);
    await updatePostLikes(postId);
    res.redirect('/');
});

app.get('/profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }

    const user = await findUserById(req.user.id);
    if (!user) {
        return res.redirect('/error');
    }

    const userPosts = await db.all('SELECT * FROM posts WHERE username = ? ORDER BY timestamp DESC', user.username);
    res.render('profile', { user, userPosts });
});





app.get('/avatar/:username', async (req, res) => {
    const username = req.params.username;
    const user = await findUserByUsername(username);
    if (!user) {
        res.status(404).send('User not found');
        return;
    }


    if (user.avatar_url) {
        try {
            const response = await fetch(user.avatar_url);
            if (!response.ok) {
                throw new Error('Failed to fetch avatar');
            }
            const buffer = await response.buffer();
            res.set('Content-Type', 'image/png');
            res.send(buffer);
        } catch (error) {
            console.error('Error fetching avatar:', error);
            res.status(500).send('Error fetching avatar');
        }
    } else {
        const firstLetter = user.username.charAt(0).toUpperCase();
        const avatarBuffer = generateAvatar(firstLetter);
        res.set('Content-Type', 'image/png');
        res.send(avatarBuffer);
    }
});


async function fetchAvatarBuffer(url) {
    const response = await fetch(url);
    const buffer = await response.buffer();
    return buffer;
}

// Update
app.get('/edit-profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }


    const user = await findUserById(req.user.id);
    if (!user) {
        return res.redirect('/error');
    }


    res.render('editProfile', { user });
});


app.post('/edit-profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/login');
    }


    const { username, avatar_url } = req.body;
    await db.run('UPDATE users SET username = ?, avatar_url = ? WHERE id = ?', username, avatar_url, req.user.id);


    res.redirect('/profile');
});










// Google OAuth login route
app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));

// Google OAuth callback route
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), async (req, res) => {
    const user = await db.get('SELECT * FROM users WHERE hashedGoogleId = ?', req.user.hashedGoogleId);
    if (!user.username || user.username === req.user.hashedGoogleId) {
        res.redirect('/registerUsername');
    } else {
        req.session.userId = user.id;
        req.session.loggedIn = true;
        res.redirect('/');
    }
});

// Username registration route (GET)
app.get('/registerUsername', (req, res) => {
    res.render('registerUsername', { error: req.query.error });
});

// Username registration route (POST)
app.post('/registerUsername', async (req, res) => {
    const { username } = req.body;
    const existingUser = await findUserByUsername(username);
    if (existingUser) {
        res.redirect('/registerUsername?error=Username%20already%20taken');
        return;
    }
    await db.run('UPDATE users SET username = ? WHERE hashedGoogleId = ?', username, req.user.hashedGoogleId);
    req.session.userId = req.user.id;
    req.session.loggedIn = true;
    res.redirect('/');
});

// Logout route
app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy();
        res.redirect('/googleLogout');
    });
});

// Logout confirmation route
app.get('/googleLogout', (req, res) => {
    res.render('googleLogout');
});

// Logout callback route
app.get('/logoutCallback', (req, res) => {
    res.redirect('/login');
});

app.post('/comment', async (req, res) => {
    const { postId, content } = req.body;
    const user = await findUserById(req.user.id);
    if (!user) {
        res.redirect('/error');
        return;
    }
    await addComment(postId, user.username, content);
    res.redirect(`/post/${postId}`);
});

// 设置背景图片的路由
app.post('/setBackground', ensureAuthenticated, async (req, res) => {
    const { filePath } = req.body;
    try {
        console.log('Updating background for user:', req.user.id, 'with filePath:', filePath); // 添加日志
        await db.run('UPDATE users SET background_url = ? WHERE id = ?', filePath, req.user.id);
        res.status(200).send('Profile background updated successfully.');
    } catch (error) {
        console.error('Error updating profile background:', error);
        res.status(500).send('Failed to update profile background.');
    }
});

app.get('/fetch-emojis', async (req, res) => {
   try {
       const apiKey = 'f17d08ed9083f34b80fabba9d06d597517ede322';
       const response = await fetch(`https://emoji-api.com/emojis?access_key=${apiKey}`);
       const emojis = await response.json();
       res.json(emojis);
   } catch (error) {
       console.error('Error fetching emojis:', error);
       res.status(500).send('Error fetching emojis');
   }
});














app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

function generateAvatar(letter, width = 50, height = 50) {
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#007bff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.floor(width / 2)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter.toUpperCase(), width / 2, height / 2);

    return canvas.toBuffer();
}
