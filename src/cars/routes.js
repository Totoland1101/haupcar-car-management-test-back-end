const { Router } = require('express');
const { PERMISSIONS } = require('../auth/permissions');
const { HttpError } = require('../errors');
const { parseId, validate } = require('../validation');
const { DuplicatePlateError } = require('./repository');
const { carInputSchema, listQuerySchema } = require('./schema');

async function saveOrConflict(save) {
  try {
    return await save();
  } catch (err) {
    if (err instanceof DuplicatePlateError) {
      throw new HttpError(409, err.message, [
        { field: 'registrationNumber', message: 'This plate is already registered in this province' },
      ]);
    }
    throw err;
  }
}

// Express 5 passes errors from async handlers to the error middleware, so no try/catch is needed here.
function createCarsRouter(repo, { can }) {
  const router = Router();

  router.get('/', can(PERMISSIONS.CAR_VIEW), async (req, res) => {
    const query = validate(listQuerySchema, req.query, 'Invalid query parameters');
    const { items, total } = await repo.list(query);
    res.json({
      data: items,
      meta: { page: query.page, pageSize: query.pageSize, total },
    });
  });

  router.get('/summary', can(PERMISSIONS.CAR_VIEW), async (req, res) => {
    res.json(await repo.summary());
  });

  router.get('/:id', can(PERMISSIONS.CAR_VIEW), async (req, res) => {
    const car = await repo.findById(parseId(req.params.id, 'Car'));
    if (!car) throw new HttpError(404, 'Car not found');
    res.json(car);
  });

  router.post('/', can(PERMISSIONS.CAR_CREATE), async (req, res) => {
    const input = validate(carInputSchema, req.body ?? {});
    const car = await saveOrConflict(() => repo.create(input));
    res.status(201).location(`${req.baseUrl}/${car.id}`).json(car);
  });

  router.put('/:id', can(PERMISSIONS.CAR_UPDATE), async (req, res) => {
    const id = parseId(req.params.id, 'Car');
    const input = validate(carInputSchema, req.body ?? {});
    const car = await saveOrConflict(() => repo.update(id, input));
    if (!car) throw new HttpError(404, 'Car not found');
    res.json(car);
  });

  router.delete('/:id', can(PERMISSIONS.CAR_DELETE), async (req, res) => {
    const removed = await repo.remove(parseId(req.params.id, 'Car'));
    if (!removed) throw new HttpError(404, 'Car not found');
    res.status(204).end();
  });

  return router;
}

module.exports = { createCarsRouter };
