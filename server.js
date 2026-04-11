require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./src/config/db');

const app = express();

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Routes
app.use('/api/player',   require('./src/routes/player'));
app.use('/api/byte',     require('./src/routes/byte'));
app.use('/api/battle',   require('./src/routes/battle'));
app.use('/api/pageant',  require('./src/routes/pageant'));
app.use('/api/shop',     require('./src/routes/shop'));
app.use('/api/economy',  require('./src/routes/economy'));
app.use('/api/rooms',    require('./src/routes/rooms'));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`MEGA-BYTES backend running on port ${PORT}`));
