const jwt = require('jsonwebtoken');

function signToken(userId, { secret, expiresIn }) {
  return jwt.sign({}, secret, { subject: String(userId), expiresIn, algorithm: 'HS256' });
}

// Returns the user id, or null when the token is missing, tampered with or expired.
function readToken(token, secret) {
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    return Number(payload.sub) || null;
  } catch {
    return null;
  }
}

module.exports = { signToken, readToken };
