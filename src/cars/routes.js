const { Router } = require('express');
const { HttpError } = require('../errors');
const { DuplicatePlateError } = require('./repository');
const { carInputSchema, idSchema, listQuerySchema } = require('./schema');

function validate(schema, input, message = 'Validation failed') {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new HttpError(400, message, details);
  }
  return result.data;
}

function parseId(raw) {
  const result = idSchema.safeParse(raw);
  if (!result.success) throw new HttpError(400, 'Car id must be a positive whole number');
  return result.data;
}

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
function createCarsRouter(repo) {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = validate(listQuerySchema, req.query, 'Invalid query parameters');
    const { items, total } = await repo.list(query);
    res.json({
      data: items,
      meta: { page: query.page, pageSize: query.pageSize, total },
    });
  });

  router.get('/summary', async (req, res) => {
    res.json(await repo.summary());
  });

  router.get('/:id', async (req, res) => {
    const car = await repo.findById(parseId(req.params.id));
    if (!car) throw new HttpError(404, 'Car not found');
    res.json(car);
  });

  router.post('/', async (req, res) => {
    const input = validate(carInputSchema, req.body ?? {});
    const car = await saveOrConflict(() => repo.create(input));
    res.status(201).location(`${req.baseUrl}/${car.id}`).json(car);
  });

  router.put('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    const input = validate(carInputSchema, req.body ?? {});
    const car = await saveOrConflict(() => repo.update(id, input));
    if (!car) throw new HttpError(404, 'Car not found');
    res.json(car);
  });

  router.delete('/:id', async (req, res) => {
    const removed = await repo.remove(parseId(req.params.id));
    if (!removed) throw new HttpError(404, 'Car not found');
    res.status(204).end();
  });

  return router;
}

module.exports = { createCarsRouter };
