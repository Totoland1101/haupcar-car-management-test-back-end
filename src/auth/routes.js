const { Router } = require('express');
const { z } = require('zod');
const { HttpError } = require('../errors');
const { validate } = require('../validation');
const { verifyAgainstDummy, verifyPassword } = require('./password');
const { signToken } = require('./token');

const loginSchema = z.object({
  username: z.string({ error: 'Username is required' }).trim().toLowerCase().min(1, 'Username is required'),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

function createAuthRouter({ userRepo, auth, jwtSecret, jwtExpiresIn }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { username, password } = validate(loginSchema, req.body ?? {});
    const found = await userRepo.findForLogin(username);

    const passwordOk = found
      ? await verifyPassword(password, found.passwordSalt, found.passwordHash)
      : await verifyAgainstDummy(password);
    // The same message for both cases, so the response doesn't reveal which usernames exist.
    if (!passwordOk) throw new HttpError(401, 'Incorrect username or password');
    if (!found.user.isActive) throw new HttpError(403, 'This account has been disabled');

    await userRepo.recordLogin(found.user.id);
    const token = signToken(found.user.id, { secret: jwtSecret, expiresIn: jwtExpiresIn });
    res.json({ token, user: found.user });
  });

  router.get('/me', auth.authenticate, (req, res) => {
    res.json(req.user);
  });

  return router;
}

module.exports = { createAuthRouter };
