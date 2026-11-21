const express = require('express');
const { Router } = require('express');
const { PERMISSIONS } = require('../auth/permissions');
const { HttpError } = require('../errors');
const { parseId } = require('../validation');

const SIDES = ['front', 'left', 'right', 'back'];
const MAX_BYTES = 5 * 1024 * 1024;

// The first bytes of each accepted format, so a renamed text file isn't stored as a photo.
const SIGNATURES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

function parseSide(raw) {
  if (!SIDES.includes(raw)) throw new HttpError(400, `Side must be one of: ${SIDES.join(', ')}`);
  return raw;
}

function toPhoto(photo) {
  return { side: photo.side, contentType: photo.contentType, size: photo.size, updatedAt: photo.updatedAt };
}

// /api/cars/:id/photos. Viewing needs car.view, changing needs car.update.
function createCarPhotosRouter({ Car, CarPhoto }, { can }) {
  const router = Router({ mergeParams: true });

  async function findCar(req) {
    const car = await Car.findByPk(parseId(req.params.id, 'Car'), { attributes: ['id'] });
    if (!car) throw new HttpError(404, 'Car not found');
    return car;
  }

  router.get('/', can(PERMISSIONS.CAR_VIEW), async (req, res) => {
    const car = await findCar(req);
    const photos = await CarPhoto.findAll({ where: { carId: car.id } });
    res.json({ data: photos.sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side)).map(toPhoto) });
  });

  router.get('/:side', can(PERMISSIONS.CAR_VIEW), async (req, res) => {
    const car = await findCar(req);
    const photo = await CarPhoto.scope('withData').findOne({ where: { carId: car.id, side: parseSide(req.params.side) } });
    if (!photo) throw new HttpError(404, 'No photo for this side');
    res.set('Content-Type', photo.contentType).set('Cache-Control', 'private, no-cache').send(photo.data);
  });

  router.put(
    '/:side',
    can(PERMISSIONS.CAR_UPDATE),
    express.raw({ type: Object.keys(SIGNATURES), limit: MAX_BYTES }),
    async (req, res) => {
      const car = await findCar(req);
      const side = parseSide(req.params.side);
      const contentType = req.get('content-type')?.split(';')[0].trim();

      if (!SIGNATURES[contentType]) {
        throw new HttpError(415, 'Send the photo as image/jpeg, image/png or image/webp');
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'The photo is empty');
      if (!SIGNATURES[contentType](req.body)) throw new HttpError(400, `This file is not a ${contentType.split('/')[1]} image`);

      const fields = { contentType, size: req.body.length, data: req.body };
      const existing = await CarPhoto.findOne({ where: { carId: car.id, side } });
      const photo = existing ? await existing.update(fields) : await CarPhoto.create({ carId: car.id, side, ...fields });
      res.status(existing ? 200 : 201).json(toPhoto(photo));
    }
  );

  router.delete('/:side', can(PERMISSIONS.CAR_UPDATE), async (req, res) => {
    const car = await findCar(req);
    const deleted = await CarPhoto.destroy({ where: { carId: car.id, side: parseSide(req.params.side) } });
    if (!deleted) throw new HttpError(404, 'No photo for this side');
    res.status(204).end();
  });

  return router;
}

module.exports = { MAX_BYTES, SIDES, createCarPhotosRouter };
