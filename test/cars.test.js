const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, test } = require('node:test');
const { createApp } = require('../src/app');
const { JWT_SECRET, loginAs, resetUsersAndRoles } = require('./helpers');

// The tests empty haup_cars, so make sure they never touch the development database.
// npm test runs the migrations on the test database first.
process.env.NODE_ENV = 'test';
const db = require('../db/models');

const yaris = {
  registrationNumber: '1กข 1234',
  province: 'กรุงเทพมหานคร',
  brand: 'Toyota',
  model: 'Yaris Ativ',
  fuelType: 'gasoline',
  year: 2023,
  color: 'White',
  mileage: 15200,
  registeredMileage: 1200,
  status: 'available',
  notes: 'Spare key in the office drawer',
};

const city = {
  registrationNumber: '2ขค 5678',
  province: 'เชียงใหม่',
  brand: 'Honda',
  model: 'City',
  fuelType: 'gasoline',
  registeredMileage: 0,
  status: 'maintenance',
};

const app = createApp({ db, jwtSecret: JWT_SECRET });

// The car routes need a logged-in user. An admin has every car permission.
// test/auth.test.js covers what happens with fewer permissions.
let api;

before(async () => {
  await resetUsersAndRoles(db);
  api = await loginAs(app, db, 'admin', 'Admin');
});

beforeEach(async () => {
  await db.Car.truncate({ cascade: true, restartIdentity: true });
});

after(async () => {
  await db.sequelize.close();
});

async function createCar(car) {
  const res = await api.post('/api/cars').send(car).expect(201);
  return res.body;
}

describe('POST /api/cars', () => {
  test('creates a car and returns it with an id and timestamps', async () => {
    const res = await api.post('/api/cars').send(yaris).expect(201);

    assert.equal(typeof res.body.id, 'number');
    assert.equal(res.headers.location, `/api/cars/${res.body.id}`);
    assert.equal(res.body.model, 'Yaris Ativ');
    assert.equal(res.body.mileage, 15200);
    assert.ok(res.body.createdAt);
    assert.equal(res.body.createdAt, res.body.updatedAt);
  });

  test('only requires plate, province, brand, model, fuel type and mileage at registration', async () => {
    const car = await createCar({
      registrationNumber: 'กข 1',
      province: 'ตาก',
      brand: 'Isuzu',
      model: 'D-Max',
      fuelType: 'diesel',
      registeredMileage: 0,
    });

    assert.equal(car.status, 'available');
    assert.equal(car.year, null);
    assert.equal(car.notes, null);
  });

  test('writes the registration number the same way every time', async () => {
    const car = await createCar({ ...yaris, registrationNumber: '  1กข   1234 ' });
    assert.equal(car.registrationNumber, '1กข 1234');

    const joined = await createCar({ ...city, registrationNumber: '2ขค5678' });
    assert.equal(joined.registrationNumber, '2ขค 5678');
  });

  test('only accepts Thai plates and Thai provinces', async () => {
    for (const plate of ['EV 99', 'กขค 1234', 'กข 0123', 'กข 12345', '12กข 1234', '1234']) {
      const res = await api.post('/api/cars').send({ ...yaris, registrationNumber: plate }).expect(400);
      assert.deepEqual(res.body.error.details, [
        { field: 'registrationNumber', message: 'Use a Thai plate, for example 1กข 1234 or กข 1234' },
      ], plate);
    }

    const province = await api.post('/api/cars').send({ ...yaris, province: 'Bangkok' }).expect(400);
    assert.deepEqual(province.body.error.details, [
      { field: 'province', message: 'Province must be one of the 77 Thai provinces' },
    ]);
  });

  test('rejects missing and invalid fields with a 400 and per-field details', async () => {
    const res = await api
      .post('/api/cars')
      .send({ brand: '', year: 'last year', status: 'flying' })
      .expect(400);

    const fields = res.body.error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['brand', 'fuelType', 'model', 'province', 'registeredMileage', 'registrationNumber', 'status', 'year']);
  });

  test('rejects a plate that already exists in the same province', async () => {
    await createCar(yaris);
    const res = await api
      .post('/api/cars')
      .send({ ...city, registrationNumber: yaris.registrationNumber, province: yaris.province })
      .expect(409);

    assert.equal(res.body.error.details[0].field, 'registrationNumber');
  });

  test('allows the same plate number in a different province', async () => {
    await createCar(yaris);
    await createCar({ ...yaris, province: 'ภูเก็ต' });
  });

  test('returns 400 for a body that is not valid JSON', async () => {
    await api
      .post('/api/cars')
      .set('Content-Type', 'application/json')
      .send('{"brand":')
      .expect(400);
  });
});

describe('GET /api/cars', () => {
  beforeEach(async () => {
    await createCar(yaris);
    await createCar(city);
    await createCar({ ...yaris, registrationNumber: '3กค 1111', model: 'Camry', status: 'in_use' });
  });

  test('lists every car with pagination info', async () => {
    const res = await api.get('/api/cars').expect(200);

    assert.equal(res.body.data.length, 3);
    assert.deepEqual(res.body.meta, { page: 1, pageSize: 10, total: 3 });
  });

  test('searches across plate, brand, model and notes', async () => {
    const byBrand = await api.get('/api/cars').query({ search: 'honda' }).expect(200);
    assert.deepEqual(byBrand.body.data.map((c) => c.model), ['City']);

    const byNotes = await api.get('/api/cars').query({ search: 'spare key' }).expect(200);
    assert.deepEqual(byNotes.body.data.map((c) => c.model), ['Camry', 'Yaris Ativ']);
  });

  test('treats % and _ in the search text literally', async () => {
    const res = await api.get('/api/cars').query({ search: '%' }).expect(200);
    assert.equal(res.body.meta.total, 0);
  });

  test('filters by status and brand', async () => {
    const res = await api.get('/api/cars').query({ status: 'in_use', brand: 'toyota' }).expect(200);
    assert.deepEqual(res.body.data.map((c) => c.model), ['Camry']);
  });

  test('sorts by the requested field', async () => {
    const res = await api.get('/api/cars').query({ sortBy: 'model', order: 'asc' }).expect(200);
    assert.deepEqual(res.body.data.map((c) => c.model), ['Camry', 'City', 'Yaris Ativ']);
  });

  test('pages through results', async () => {
    const res = await api
      .get('/api/cars')
      .query({ sortBy: 'model', order: 'asc', page: 2, pageSize: 2 })
      .expect(200);

    assert.deepEqual(res.body.data.map((c) => c.model), ['Yaris Ativ']);
    assert.deepEqual(res.body.meta, { page: 2, pageSize: 2, total: 3 });
  });

  test('rejects an unknown sort field', async () => {
    await api.get('/api/cars').query({ sortBy: 'id; DROP TABLE cars' }).expect(400);
  });
});

describe('GET /api/cars/summary', () => {
  test('counts cars by status and lists the brands in use', async () => {
    await createCar(yaris);
    await createCar(city);

    const res = await api.get('/api/cars/summary').expect(200);

    assert.equal(res.body.total, 2);
    assert.deepEqual(res.body.byStatus, { available: 1, in_use: 0, maintenance: 1, inactive: 0 });
    assert.deepEqual(res.body.brands, ['Honda', 'Toyota']);
  });
});

describe('GET /api/cars/:id', () => {
  test('returns one car', async () => {
    const created = await createCar(yaris);
    const res = await api.get(`/api/cars/${created.id}`).expect(200);
    assert.deepEqual(res.body, created);
  });

  test('returns 404 for a car that does not exist', async () => {
    await api.get('/api/cars/999').expect(404);
  });

  test('returns 400 for an id that is not a number', async () => {
    await api.get('/api/cars/abc').expect(400);
  });
});

describe('PUT /api/cars/:id', () => {
  test('replaces the car details and bumps updatedAt', async () => {
    const created = await createCar(yaris);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const res = await api
      .put(`/api/cars/${created.id}`)
      .send({ ...yaris, status: 'maintenance', notes: null, mileage: 16000 })
      .expect(200);

    assert.equal(res.body.status, 'maintenance');
    assert.equal(res.body.notes, null);
    assert.equal(res.body.mileage, 16000);
    assert.equal(res.body.createdAt, created.createdAt);
    assert.ok(res.body.updatedAt > created.updatedAt);
  });

  test('validates the body the same way as create', async () => {
    const created = await createCar(yaris);
    await api.put(`/api/cars/${created.id}`).send({ ...yaris, brand: '' }).expect(400);
  });

  test('returns 409 when moving to a plate another car already uses', async () => {
    await createCar(yaris);
    const other = await createCar(city);

    await api
      .put(`/api/cars/${other.id}`)
      .send({ ...city, registrationNumber: yaris.registrationNumber, province: yaris.province })
      .expect(409);
  });

  test('returns 404 for a car that does not exist', async () => {
    await api.put('/api/cars/999').send(yaris).expect(404);
  });
});

describe('DELETE /api/cars/:id', () => {
  test('deletes the car', async () => {
    const created = await createCar(yaris);

    await api.delete(`/api/cars/${created.id}`).expect(204);
    await api.get(`/api/cars/${created.id}`).expect(404);
  });

  test('returns 404 for a car that does not exist', async () => {
    await api.delete('/api/cars/999').expect(404);
  });
});

test('unknown API routes return a JSON 404', async () => {
  const res = await api.get('/api/trucks').expect(404);
  assert.match(res.body.error.message, /not found/);
});

test('every table the migrations create starts with haup_', async () => {
  const tables = await db.sequelize.getQueryInterface().showAllTables();

  assert.ok(tables.includes('haup_cars'));
  assert.deepEqual(tables.filter((name) => !name.startsWith('haup_')), []);
});

describe('registration date and mileage at registration', () => {
  const today = new Date().toLocaleDateString('en-CA');

  test('the date defaults to today, and the mileage at registration is required', async () => {
    const car = await createCar(yaris);
    assert.equal(car.registeredOn, today);
    assert.equal(car.registeredMileage, 1200);

    const { registeredMileage, ...withoutMileage } = yaris;
    const res = await api.post('/api/cars').send({ ...withoutMileage, registrationNumber: '9ขข 9999' }).expect(400);
    assert.deepEqual(res.body.error.details, [{ field: 'registeredMileage', message: 'Mileage at registration is required' }]);
  });

  test('are stored when given, and kept apart from the current mileage', async () => {
    const car = await createCar({ ...yaris, registeredOn: '2024-03-01', registeredMileage: 1200, mileage: 15200 });
    assert.equal(car.registeredOn, '2024-03-01');
    assert.equal(car.registeredMileage, 1200);
    assert.equal(car.mileage, 15200);
  });

  test('an edit that leaves the date out keeps it', async () => {
    const car = await createCar({ ...yaris, registeredOn: '2024-03-01' });
    const res = await api.put(`/api/cars/${car.id}`).send({ ...yaris, mileage: 16000 }).expect(200);
    assert.equal(res.body.registeredOn, '2024-03-01');
  });

  test('rejects a future or malformed date, and a current mileage below the registered one', async () => {
    const res = await api
      .post('/api/cars')
      .send({ ...yaris, registeredOn: '2999-01-01', registeredMileage: 20000, mileage: 100 })
      .expect(400);
    assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), ['mileage', 'registeredOn']);

    const bad = await api.post('/api/cars').send({ ...yaris, registeredOn: '01/03/2024' }).expect(400);
    assert.equal(bad.body.error.details[0].field, 'registeredOn');

    const lower = await api.post('/api/cars').send({ ...yaris, registeredMileage: 20000, mileage: 100 }).expect(400);
    assert.deepEqual(lower.body.error.details, [
      { field: 'mileage', message: 'Mileage cannot be lower than the mileage at registration' },
    ]);
  });

  test('can sort by registration date', async () => {
    await createCar({ ...yaris, registeredOn: '2024-03-01' });
    await createCar({ ...city, registeredOn: '2023-01-15' });
    const res = await api.get('/api/cars?sortBy=registeredOn&order=asc').expect(200);
    assert.deepEqual(res.body.data.map((c) => c.registeredOn), ['2023-01-15', '2024-03-01']);
  });
});

describe('fuel type', () => {
  test('is stored, and can be changed', async () => {
    const car = await createCar({ ...yaris, fuelType: 'hybrid' });
    assert.equal(car.fuelType, 'hybrid');

    const res = await api.put(`/api/cars/${car.id}`).send({ ...yaris, fuelType: 'electric' }).expect(200);
    assert.equal(res.body.fuelType, 'electric');
  });

  test('is required and must be a known type', async () => {
    const { fuelType, ...withoutFuel } = yaris;
    const missing = await api.post('/api/cars').send(withoutFuel).expect(400);
    assert.deepEqual(missing.body.error.details, [{ field: 'fuelType', message: 'Fuel type is required' }]);

    const unknown = await api.post('/api/cars').send({ ...yaris, fuelType: 'steam' }).expect(400);
    assert.match(unknown.body.error.details[0].message, /^Fuel type must be one of: gasoline, diesel/);
  });
});
