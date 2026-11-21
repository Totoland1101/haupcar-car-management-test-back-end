const { HttpError } = require('../errors');
const { readToken } = require('./token');

function createAuth({ userRepo, jwtSecret }) {
  // Reads the Bearer token and puts the user, with their permissions, on req.user.
  // The user is loaded on every request, so a disabled account or a changed role
  // takes effect straight away instead of when the token expires.
  async function authenticate(req, res, next) {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Please log in');
    }

    const userId = readToken(token, jwtSecret);
    const user = userId && (await userRepo.findAuthById(userId));
    if (!user || !user.isActive) {
      throw new HttpError(401, 'Your session has ended. Please log in again');
    }

    req.user = user;
    next();
  }

  function forbidden() {
    return new HttpError(403, 'You do not have permission to do this');
  }

  // The user needs every listed permission.
  function can(...codes) {
    return (req, res, next) => {
      if (!codes.every((code) => req.user.permissions.includes(code))) throw forbidden();
      next();
    };
  }

  // The user needs at least one of the listed permissions.
  function canAny(...codes) {
    return (req, res, next) => {
      if (!codes.some((code) => req.user.permissions.includes(code))) throw forbidden();
      next();
    };
  }

  return { authenticate, can, canAny };
}

module.exports = { createAuth };
