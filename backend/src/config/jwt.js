const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'eventpulse_default_jwt_secret_key_1234567890abcdef_change_in_production';
const JWT_EXPIRES_IN = '7d';

/**
 * Sign a JWT payload
 * @param {object} payload - Data to encode (e.g. { id, email })
 * @returns {string} signed token
 */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify a JWT token
 * @param {string} token
 * @returns {object} decoded payload
 */
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signToken, verifyToken };
