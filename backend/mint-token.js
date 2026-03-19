const jwt = require('jsonwebtoken');

// The payload must match what your auth middleware expects (decoded.id)
const payload = { id: '69b12329cf244fb67aa3a404' }; 

// Replace this string with the actual JWT_SECRET from your .env file
const secret = 'xWoR7YUKj4yIi7DMFOuC'; 

const token = jwt.sign(payload, secret, { expiresIn: '30d' });

console.log("\n=== COPY THIS TOKEN ===");
console.log(token);
console.log("=======================\n");