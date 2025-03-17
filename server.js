const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const open = require('open');
const cors = require('cors');
const { exec } = require('child_process'); // Import the child_process module to open the browser
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Middleware
app.use(cors({
    origin: 'http://localhost:5500', // Replace with your frontend URL
    credentials: true,
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// MongoDB Connection
const mongoURI = 'mongodb://localhost:27017/userManagementDB';
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    score: { type: Number, default: 0 },
    badges: { type: [String], default: [] },
    levelsCompleted: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    sharedOnSocialMedia: { type: Boolean, default: false },
    profilePic: { type: String, default: 'default-profile.png' }, // Add profile picture field
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// Routes

// Signup Route
app.post('/signup', async (req, res) => {
    try {
        const { username, address, phone, email, password, confirmPassword } = req.body;

        // Check if passwords match
        if (password !== confirmPassword) {
            return res.status(400).json({ error: '❌ Passwords do not match' });
        }

        // Check if username or email already exists
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: '❌ Username or email already exists' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create a new user
        const newUser = new User({
            username,
            address,
            phone,
            email,
            password: hashedPassword,
        });

        // Save the user to the database
        await newUser.save();
        res.status(201).json({ message: '✅ User created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '❌ Internal server error' });
    }
});

// Login Route
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Check if username and password are provided
        if (!username || !password) {
            return res.status(400).json({ error: '❌ Username and password are required' });
        }

        // Find the user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ error: '❌ Invalid username or password' });
        }

        // Compare the provided password with the hashed password in the database
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: '❌ Invalid username or password' });
        }

        // If credentials are valid, return a success message
        res.status(200).json({ message: '✅ Login successful', username: user.username });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '❌ Internal server error' });
    }
});

// Update User Score and Badges
app.post('/updatescore', async (req, res) => {
    try {
        const { username, score, levelsCompleted, accuracy, sharedOnSocialMedia } = req.body;

        // Find the user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: '❌ User not found' });
        }

        // Update user data
        user.score = score;
        user.levelsCompleted = levelsCompleted;
        user.accuracy = accuracy;
        user.sharedOnSocialMedia = sharedOnSocialMedia;

        // Check and award badges
        const badges = [];
        if (user.levelsCompleted >= 50) badges.push('🏆 Quiz Master');
        if (user.levelsCompleted >= 10) badges.push('✅ Beginner Challenger');
        if (user.levelsCompleted >= 25) badges.push('🔥 Intermediate Pro');
        if (user.sharedOnSocialMedia) badges.push('📢 Social Sharer');
        if (user.accuracy >= 90) badges.push('🎯 Accuracy Master');

        // Ensure no duplicate badges
        user.badges = [...new Set([...user.badges, ...badges])];

        // Save the updated user data
        await user.save();
        res.status(200).json({ message: '✅ Score and badges updated successfully', badges });
    } catch (err) {
        console.error('Error in /updatescore:', err);
        res.status(500).json({ error: '❌ Internal server error' });
    }
});

// Fetch Leaderboard
app.get('/leaderboard', async (req, res) => {
    try {
        // Fetch top 10 users with the highest scores
        const leaderboard = await User.find({})
            .sort({ score: -1 }) // Sort by score in descending order
            .limit(10) // Limit to top 10
            .select('username score badges levelsCompleted accuracy'); // Fetch relevant fields

        res.status(200).json(leaderboard);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '❌ Internal server error' });
    }
});

// Fetch Logged-In User's Data
app.get('/user-data', async (req, res) => {
    try {
        const { username } = req.query; // Get the username from the query parameters

        // Find the user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: '❌ User not found' });
        }

        // Return the user data
        res.status(200).json(user);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '❌ Internal server error' });
    }
});

// Update User Info
app.put('/update-user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const { email, phone, password, profilePic } = req.body;

        // Find the user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: '❌ User not found' });
        }

        // Update user data
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (password) user.password = await bcrypt.hash(password, 10); // Hash the new password
        if (profilePic) user.profilePic = profilePic;

        // Save the updated user data
        await user.save();
        res.status(200).json({ message: '✅ User info updated successfully' });
    } catch (err) {
        console.error('Error updating user info:', err);
        res.status(500).json({ error: '❌ Internal server error' });
    }
});

// Start Server


app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    // Automatically open the browser
    const url = `http://localhost:${PORT}/index.html`;
    const command = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
    exec(command, (err) => {
        if (err) {
            console.error('❌ Failed to open browser:', err);
        } else {
            console.log('✅ Browser opened successfully');
        }
    });
});