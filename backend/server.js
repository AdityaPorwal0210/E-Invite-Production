require('dotenv').config();
const { errorHandler } = require('./middleware/error.middleware');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // INJECTED: Security Headers
const rateLimit = require('express-rate-limit'); // INJECTED: DDoS Protection
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const startReminderCron = require('./utils/reminderCron');

// 1. Import Routes
const userRoutes = require('./routes/userRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
const groupRoutes = require('./routes/groupRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const paymentRoutes = require('./routes/paymentRoutes'); // MOVED TO TOP

// Connect to Database
connectDB();
const app = express();

// ==========================================
// CRITICAL FIX: Trust the Render Reverse Proxy
// Without this, the rate limiter bans everyone simultaneously.
// ==========================================
app.set('trust proxy', 1);

// ==========================================
// THE SHIELD: SECURITY MIDDLEWARE
// ==========================================
// Block common web vulnerabilities (XSS, Clickjacking, etc.)
app.use(helmet());

// Global Rate Limiter: Stops generic DDoS floods on your API
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 minutes
  message: { message: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply the global limiter ONLY to API routes so we don't block static assets
app.use('/api', globalLimiter);
// ==========================================

// Standard Middleware
app.use(cors({
    origin: [
        'http://localhost:5173', // Local development
        'https://invitoinnbox.vercel.app' // Live production frontend
    ],
    credentials: true, 
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Dev request logger — prints every API call with status + duration
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });
}

// 2. Mount Routes
app.use('/api/users', userRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentRoutes); // MOUNTED CLEANLY

// The Kill Switch Config
app.get('/api/config/paywall', (req, res) => {
  res.json({ 
    paywallActive: process.env.PAYWALL_ACTIVE === 'true',
    freeLimit: 50 
  });
});

// Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'API is running...' });
});

// 3. Global Error Handling Middleware (MUST be the last middleware)
app.use((err, req, res, next) => {
  console.error("Global Error:", err.message);
  
  // Handle Multer payload errors specifically
  if (err.name === 'MulterError') {
    return res.status(400).json({ message: `Upload error: ${err.message}` });
  }

  res.status(err.status || 500).json({ 
    message: err.message || "Internal Server Error",
    // Only show stack trace in development, never in production
    stack: process.env.NODE_ENV === 'production' ? null : err.stack 
  });
});

// 4. Socket.io Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://invitoinnbox.vercel.app'
    ],
    credentials: true
  }
});

// Make io available to controllers via app.set('io', io)
app.set('io', io);

// Socket.io connection listener
io.on('connection', (socket) => {
  console.log('🔌 A user connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 A user disconnected:', socket.id);
  });
});

// 5. Dynamic Port Assignment
const PORT = process.env.PORT || 5005;

// 🚨 THE IGNITION SWITCH: Start the background worker
startReminderCron();

// Fallback Error Handler
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});