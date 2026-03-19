const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    let token;

    // Check for JWT in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If token is missing, return 401 Unauthorized
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find the user in the database, excluding the password field
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    // Attach user to req object
    req.user = user;

    // Call next middleware
    next();
  } catch (error) {
    // Handle JWT verification errors
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Not authorized, invalid token' });
    }
    
    // Pass other errors to error handler
    next(error);
  }
};

module.exports = { protect };
