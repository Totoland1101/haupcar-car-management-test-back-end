const { Router } = require('express');
const { PERMISSIONS } = require('../auth/permissions');
const { HttpError } = require('../errors');
const { parseId, validate } = require('../validation');
const {
  DuplicateRoleNameError,
  RoleInUseError,
  SystemRoleError,
  UnknownPermissionError,
} = require('./repository');
const { roleInputSchema } = require('./schema');

function toHttpError(err) {
  if (err instanceof DuplicateRoleNameError) {
    return new HttpError(409, err.message, [{ field: 'name', message: 'This name is already used by another role' }]);
  }
  if (err instanceof UnknownPermissionError) {
    return new HttpError(400, err.message, [{ field: 'permissions', message: err.message }]);
  }
  if (err instanceof SystemRoleError || err instanceof RoleInUseError) {
    return new HttpError(409, err.message);
  }
  return err;
}

async function run(action) {
  try {
    return await action();
  } catch (err) {
    throw toHttpError(err);
  }
}

function createRolesRouter(repo, { can, canAny }) {
  const router = Router();
  const manage = can(PERMISSIONS.ROLE_MANAGE);

  // The user form and the approval dialog both need the role list.
  router.get('/', canAny(PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_MANAGE, PERMISSIONS.USER_APPROVE), async (req, res) => {
    res.json({ data: await repo.list() });
  });

  router.get('/:id', manage, async (req, res) => {
    const role = await repo.findById(parseId(req.params.id, 'Role'));
    if (!role) throw new HttpError(404, 'Role not found');
    res.json(role);
  });

  router.post('/', manage, async (req, res) => {
    const input = validate(roleInputSchema, req.body ?? {});
    const role = await run(() => repo.create(input));
    res.status(201).location(`${req.baseUrl}/${role.id}`).json(role);
  });

  router.put('/:id', manage, async (req, res) => {
    const id = parseId(req.params.id, 'Role');
    const input = validate(roleInputSchema, req.body ?? {});
    const role = await run(() => repo.update(id, input));
    if (!role) throw new HttpError(404, 'Role not found');
    res.json(role);
  });

  router.delete('/:id', manage, async (req, res) => {
    const removed = await run(() => repo.remove(parseId(req.params.id, 'Role')));
    if (!removed) throw new HttpError(404, 'Role not found');
    res.status(204).end();
  });

  return router;
}

function createPermissionsRouter(repo, { can }) {
  const router = Router();

  router.get('/', can(PERMISSIONS.ROLE_MANAGE), async (req, res) => {
    res.json({ data: await repo.listPermissions() });
  });

  return router;
}

module.exports = { createPermissionsRouter, createRolesRouter };
