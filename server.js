require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');
const needTickService = require('./src/services/needTickService');

const app = express();

// Trust Render's proxy so rate-limit keys by real client IP, not proxy IP
app.set('trust proxy', 1);

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check bypasses the rate limiter — Render pings this and shouldn't eat the budget
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 }));

// Routes
app.use('/api/player',   require('./src/routes/player'));
app.use('/api/byte',     require('./src/routes/byte'));
app.use('/api/battle',   require('./src/routes/battle'));
app.use('/api/campaign', require('./src/routes/campaign'));
app.use('/api/pageant',  require('./src/routes/pageant'));
app.use('/api/shop',     require('./src/routes/shop'));
app.use('/api/marketplace', require('./src/routes/marketplace'));
app.use('/api/decor', require('./src/routes/decor'));
app.use('/api/inbox', require('./src/routes/inbox'));
app.use('/api/economy',  require('./src/routes/economy'));
app.use('/api/rooms',    require('./src/routes/rooms'));
app.use('/api/onboarding', require('./src/routes/onboarding'));
app.use('/api/achievements', require('./src/routes/achievements'));
app.use('/api/community-event', require('./src/routes/communityEvent'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`MEGA-BYTES backend running on port ${PORT}`);
  needTickService.start(); // Begin need_tick job (1-min interval)
});
