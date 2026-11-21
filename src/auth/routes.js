const { Router } = require('express');
const { z } = require('zod');
const { HttpError } = require('../errors');
const { profileSchema, registerSchema } = require('../users/schema');
const { DuplicateUsernameError, UnknownDepartmentError } = require('../users/repository');
const { validate } = require('../validation');
const { verifyAgainstDummy, verifyPassword } = require('./password');
const { signToken } = require('./token');

const loginSchema = z.object({
  username: z.string({ error: 'Username is required' }).trim().toLowerCase().min(1, 'Username is required'),
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required'),
});

// Only checked after the password matched, so these messages don't help anyone guess.
const LOGIN_BLOCKED = {
  pending: 'Your account is waiting for an admin to approve it',
  rejected: 'Your registration was not approved. Ask an admin if you think this is a mistake.',
};

function createAuthRouter({ userRepo, auth, jwtSecret, jwtExpiresIn }) {
  const router = Router();

  router.post('/login', async (req, res) => {
    const { username, password } = validate(loginSchema, req.body ?? {});
    const found = await userRepo.findForLogin(username);

    const passwordOk = found
      ? await verifyPassword(password, found.password)
      : await verifyAgainstDummy(password);
    // The same message for both cases, so the response doesn't reveal which usernames exist.
    if (!passwordOk) throw new HttpError(401, 'Incorrect username or password');
    if (LOGIN_BLOCKED[found.user.status]) throw new HttpError(403, LOGIN_BLOCKED[found.user.status]);
    if (!found.user.isActive) throw new HttpError(403, 'This account has been disabled');

    await userRepo.recordLogin(found.user.id);
    const token = signToken(found.user.id, { secret: jwtSecret, expiresIn: jwtExpiresIn });
    res.json({ token, user: found.user });
  });

  router.post('/register', async (req, res) => {
    const input = validate(registerSchema, req.body ?? {});
    try {
      await userRepo.register(input);
    } catch (err) {
      if (err instanceof DuplicateUsernameError) {
        throw new HttpError(409, err.message, [{ field: 'username', message: 'This username is already taken' }]);
      }
      throw err;
    }
    // No token: the account can't be used until someone approves it.
    res.status(201).json({ message: 'Thanks for registering. You can log in once an admin approves your account.' });
  });

  router.get('/me', auth.authenticate, (req, res) => {
    res.json(req.user);
  });

  // Anyone can edit their own details. The role and permissions aren't part of this.
  router.put('/me/profile', auth.authenticate, async (req, res) => {
    const input = validate(profileSchema, req.body ?? {});
    try {
      res.json(await userRepo.updateProfile(req.user.id, input));
    } catch (err) {
      if (err instanceof UnknownDepartmentError) {
        throw new HttpError(400, err.message, [{ field: 'departmentId', message: err.message }]);
      }
      throw err;
    }
  });

  return router;
}

module.exports = { createAuthRouter };
