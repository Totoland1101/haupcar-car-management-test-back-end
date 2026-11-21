const { Router } = require('express');
const { z } = require('zod');
const { PERMISSIONS } = require('../auth/permissions');
const { HttpError } = require('../errors');
const { parseId, validate } = require('../validation');
const { DuplicateDepartmentError } = require('./repository');

const departmentSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
});

async function save(action) {
  try {
    return await action();
  } catch (err) {
    if (err instanceof DuplicateDepartmentError) {
      throw new HttpError(409, err.message, [{ field: 'name', message: 'This name is already used by another department' }]);
    }
    throw err;
  }
}

function createDepartmentsRouter(repo, { can }) {
  const router = Router();
  const manage = can(PERMISSIONS.USER_MANAGE);

  // Any logged-in user can read the list, for the department picker on their profile.
  router.get('/', async (req, res) => {
    res.json({ data: await repo.list() });
  });

  router.post('/', manage, async (req, res) => {
    const input = validate(departmentSchema, req.body ?? {});
    const department = await save(() => repo.create(input));
    res.status(201).location(`${req.baseUrl}/${department.id}`).json(department);
  });

  router.put('/:id', manage, async (req, res) => {
    const id = parseId(req.params.id, 'Department');
    const input = validate(departmentSchema, req.body ?? {});
    const department = await save(() => repo.update(id, input));
    if (!department) throw new HttpError(404, 'Department not found');
    res.json(department);
  });

  router.delete('/:id', manage, async (req, res) => {
    if (!(await repo.remove(parseId(req.params.id, 'Department')))) throw new HttpError(404, 'Department not found');
    res.status(204).end();
  });

  return router;
}

module.exports = { createDepartmentsRouter };
