require('dotenv').config();
const { errorHandler } = require('./middleware/error.middleware');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// 1. Import Routes
const userRoutes = require('./routes/userRoutes');
const invitationRoutes = require('./routes/invitationRoutes');
const groupRoutes = require('./routes/groupRoutes');
const uploadRoutes = require('./routes/uploadRoutes');

// Connect to Database
connectDB();
const app = express();

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173', // Keeps your local development working
        'https://invitoinnbox.vercel.app' // Your live production frontend
    ],
    credentials: true, // This is mandatory for your cookies to work
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Good practice for form submissions

// 2. Mount Routes
app.use('/api/users', userRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/upload', uploadRoutes);

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

// 4. Dynamic Port Assignment
const PORT = process.env.PORT || 5005;
app.use(errorHandler);
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});