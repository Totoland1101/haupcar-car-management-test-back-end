const { Router } = require('express');
const { PERMISSIONS } = require('../auth/permissions');
const { HttpError } = require('../errors');
const { parseId, validate } = require('../validation');
const { DuplicateUsernameError, UnknownRoleError } = require('./repository');
const { userCreateSchema, userUpdateSchema } = require('./schema');

async function saveOrConflict(save) {
  try {
    return await save();
  } catch (err) {
    if (err instanceof DuplicateUsernameError) {
      throw new HttpError(409, err.message, [{ field: 'username', message: 'This username is already taken' }]);
    }
    if (err instanceof UnknownRoleError) {
      throw new HttpError(400, err.message, [{ field: 'roleId', message: err.message }]);
    }
    throw err;
  }
}

function createUsersRouter(repo, { can }) {
  const router = Router();
  router.use(can(PERMISSIONS.USER_MANAGE));

  router.get('/', async (req, res) => {
    res.json({ data: await repo.list() });
  });

  router.get('/:id', async (req, res) => {
    const user = await repo.findById(parseId(req.params.id, 'User'));
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  });

  router.post('/', async (req, res) => {
    const input = validate(userCreateSchema, req.body ?? {});
    const user = await saveOrConflict(() => repo.create(input, { reviewerId: req.user.id }));
    res.status(201).location(`${req.baseUrl}/${user.id}`).json(user);
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'User');
    const input = validate(userUpdateSchema, req.body ?? {});

    // Stops an admin from locking themselves out by accident.
    if (id === req.user.id) {
      const details = [];
      if (!input.isActive) details.push({ field: 'isActive', message: 'You cannot disable your own account' });
      if (input.roleId !== req.user.role.id) details.push({ field: 'roleId', message: 'You cannot change your own role' });
      if (details.length) throw new HttpError(400, details[0].message, details);
    }

    const user = await saveOrConflict(() => repo.update(id, input));
    if (!user) throw new HttpError(404, 'User not found');
    res.json(user);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'User');
    if (id === req.user.id) throw new HttpError(409, 'You cannot delete your own account');
    if (!(await repo.remove(id))) throw new HttpError(404, 'User not found');
    res.status(204).end();
  });

  return router;
}

module.exports = { createUsersRouter };
