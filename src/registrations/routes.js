const { Router } = require('express');
const { z } = require('zod');
const { PERMISSIONS } = require('../auth/permissions');
const { HttpError } = require('../errors');
const { RegistrationStateError, UnknownRoleError } = require('../users/repository');
const { parseId, validate } = require('../validation');

const listQuerySchema = z.object({
  status: z.enum(['pending', 'rejected']).default('pending'),
});

const approveSchema = z.object({
  roleId: z.number({ error: 'Role is required' }).int().positive('Role is required'),
});

async function review(action) {
  try {
    return await action();
  } catch (err) {
    if (err instanceof UnknownRoleError) {
      throw new HttpError(400, err.message, [{ field: 'roleId', message: err.message }]);
    }
    if (err instanceof RegistrationStateError) throw new HttpError(409, err.message);
    throw err;
  }
}

// People who signed up on /register, waiting for someone to let them in.
function createRegistrationsRouter(repo, { can }) {
  const router = Router();
  router.use(can(PERMISSIONS.USER_APPROVE));

  router.get('/', async (req, res) => {
    const { status } = validate(listQuerySchema, req.query, 'Invalid query parameters');
    const [data, counts] = await Promise.all([repo.listRegistrations(status), repo.registrationCounts()]);
    res.json({ data, counts });
  });

  router.post('/:id/approve', async (req, res) => {
    const id = parseId(req.params.id, 'User');
    const { roleId } = validate(approveSchema, req.body ?? {});
    const user = await review(() => repo.approve(id, { roleId, reviewerId: req.user.id }));
    if (!user) throw new HttpError(404, 'Registration not found');
    res.json(user);
  });

  router.post('/:id/reject', async (req, res) => {
    const user = await review(() => repo.reject(parseId(req.params.id, 'User'), { reviewerId: req.user.id }));
    if (!user) throw new HttpError(404, 'Registration not found');
    res.json(user);
  });

  return router;
}

module.exports = { createRegistrationsRouter };
