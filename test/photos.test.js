const assert = require('node:assert/strict');
const { after, beforeEach, describe, test } = require('node:test');
const { createApp } = require('../src/app');
const { JWT_SECRET, loginAs, resetUsersAndRoles } = require('./helpers');

// Never run against the development database. npm test migrates the test database first.
process.env.NODE_ENV = 'test';
const db = require('../db/models');

const app = createApp({ db, jwtSecret: JWT_SECRET });

// Just enough bytes for each format's signature check
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(60, 2)]);

let admin;
let carId;

beforeEach(async () => {
  await db.Car.truncate({ cascade: true, restartIdentity: true });
  await resetUsersAndRoles(db);
  admin = await loginAs(app, db, 'admin', 'Admin');
  const res = await admin
    .post('/api/cars')
    .send({ registrationNumber: '1กข 1234', province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Yaris', registeredMileage: 0 })
    .expect(201);
  carId = res.body.id;
});

after(async () => {
  await db.sequelize.close();
});

function upload(side, body, type = 'image/jpeg') {
  return admin.put(`/api/cars/${carId}/photos/${side}`).set('Content-Type', type).send(body);
}

describe('/api/cars/:id/photos', () => {
  test('stores one photo per side and returns it as an image', async () => {
    const res = await upload('front', JPEG).expect(201);
    assert.equal(res.body.side, 'front');
    assert.equal(res.body.size, JPEG.length);

    const image = await admin.get(`/api/cars/${carId}/photos/front`).buffer(true).expect(200);
    assert.equal(image.headers['content-type'], 'image/jpeg');
    assert.ok(Buffer.from(image.body).equals(JPEG));
  });

  test('lists the sides that have a photo, front first', async () => {
    await upload('back', JPEG).expect(201);
    await upload('front', PNG, 'image/png').expect(201);

    const res = await admin.get(`/api/cars/${carId}/photos`).expect(200);
    assert.deepEqual(res.body.data.map((p) => [p.side, p.contentType]), [
      ['front', 'image/png'],
      ['back', 'image/jpeg'],
    ]);
  });

  test('replaces the photo for a side that already has one', async () => {
    await upload('left', JPEG).expect(201);
    await upload('left', PNG, 'image/png').expect(200);

    const image = await admin.get(`/api/cars/${carId}/photos/left`).buffer(true).expect(200);
    assert.equal(image.headers['content-type'], 'image/png');
    assert.equal(await db.CarPhoto.count({ where: { carId } }), 1);
  });

  test('deletes a photo', async () => {
    await upload('right', JPEG).expect(201);
    await admin.delete(`/api/cars/${carId}/photos/right`).expect(204);
    await admin.get(`/api/cars/${carId}/photos/right`).expect(404);
  });

  test('rejects a wrong side, a non-image type, a fake image and an oversized file', async () => {
    await upload('roof', JPEG).expect(400);
    await upload('front', Buffer.from('hello'), 'text/plain').expect(415);

    const fake = await upload('front', Buffer.from('not really a png at all'), 'image/png').expect(400);
    assert.equal(fake.body.error.message, 'This file is not a png image');

    const huge = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);
    await upload('front', huge).expect(413);
  });

  test('returns 404 for a car that does not exist', async () => {
    await admin.get('/api/cars/9999/photos').expect(404);
    await admin.put('/api/cars/9999/photos/front').set('Content-Type', 'image/jpeg').send(JPEG).expect(404);
  });

  test('a viewer can see photos but not change them', async () => {
    await upload('front', JPEG).expect(201);
    const viewer = await loginAs(app, db, 'viewer', 'Viewer');

    await viewer.get(`/api/cars/${carId}/photos`).expect(200);
    await viewer.get(`/api/cars/${carId}/photos/front`).expect(200);
    await viewer.put(`/api/cars/${carId}/photos/back`).set('Content-Type', 'image/jpeg').send(JPEG).expect(403);
    await viewer.delete(`/api/cars/${carId}/photos/front`).expect(403);
  });

  test('deleting the car deletes its photos', async () => {
    await upload('front', JPEG).expect(201);
    await admin.delete(`/api/cars/${carId}`).expect(204);
    assert.equal(await db.CarPhoto.count(), 0);
  });
});
