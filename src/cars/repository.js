const { Op, UniqueConstraintError, col, fn, literal, where } = require('sequelize');
const { CAR_STATUSES, today } = require('./schema');

const SEARCH_COLUMNS = ['registration_number', 'province', 'brand', 'model', 'color', 'notes'];

// Fields the client may write. id and the timestamps are managed by Sequelize.
const WRITABLE_FIELDS = [
  'registrationNumber',
  'redPlate',
  'province',
  'brand',
  'model',
  'fuelType',
  'year',
  'color',
  'mileage',
  'registeredMileage',
  'status',
  'notes',
];

class DuplicatePlateError extends Error {}

// PUT replaces the whole record, so a field missing from the input becomes null.
function toAttributes(input) {
  return Object.fromEntries(WRITABLE_FIELDS.map((field) => [field, input[field] ?? null]));
}

function rethrowDuplicate(err) {
  if (err instanceof UniqueConstraintError) {
    throw new DuplicatePlateError('A car with this registration number and province already exists');
  }
  throw err;
}

// Sequelize has no option for ILIKE ... ESCAPE, so the search condition is written by hand.
// The value still goes through sequelize.escape(). '!' is the escape character because it
// means the same thing in every SQL database, unlike a backslash.
function searchCondition(sequelize, text) {
  const pattern = sequelize.escape(`%${text.replace(/[!%_]/g, '!$&')}%`);
  return {
    [Op.or]: SEARCH_COLUMNS.map((column) => literal(`${column} ILIKE ${pattern} ESCAPE '!'`)),
  };
}

function createCarRepository(Car) {
  const { sequelize } = Car;

  return {
    async list({ search, status, brand, sortBy, order, page, pageSize }) {
      const conditions = [];
      if (search) conditions.push(searchCondition(sequelize, search));
      if (status) conditions.push({ status });
      if (brand) conditions.push(where(fn('lower', col('brand')), brand.toLowerCase()));

      const direction = order === 'asc' ? 'ASC' : 'DESC';
      const { rows, count } = await Car.findAndCountAll({
        where: conditions.length ? { [Op.and]: conditions } : undefined,
        // sortBy is checked against SORTABLE_FIELDS before it gets here.
        order: [
          [sortBy, direction],
          ['id', direction],
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      return { items: rows.map((car) => car.toJSON()), total: count };
    },

    async findById(id) {
      const car = await Car.findByPk(id);
      return car?.toJSON() ?? null;
    },

    async create(input) {
      try {
        const car = await Car.create({ ...toAttributes(input), registeredOn: input.registeredOn ?? today() });
        return car.toJSON();
      } catch (err) {
        rethrowDuplicate(err);
      }
    },

    async update(id, input) {
      const car = await Car.findByPk(id);
      if (!car) return null;
      try {
        // The registration date stays as it is unless a new one is given.
        const attributes = toAttributes(input);
        if (input.registeredOn) attributes.registeredOn = input.registeredOn;
        await car.update(attributes);
        return car.toJSON();
      } catch (err) {
        rethrowDuplicate(err);
      }
    },

    async remove(id) {
      const deleted = await Car.destroy({ where: { id } });
      return deleted > 0;
    },

    async summary() {
      const [statusCounts, brandRows] = await Promise.all([
        Car.count({ group: ['status'] }),
        Car.findAll({ attributes: ['brand'], group: ['brand'], raw: true }),
      ]);

      const byStatus = Object.fromEntries(CAR_STATUSES.map((status) => [status, 0]));
      let total = 0;
      for (const { status, count } of statusCounts) {
        byStatus[status] = count;
        total += count;
      }

      const brands = brandRows
        .map((row) => row.brand)
        .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));

      return { total, byStatus, brands };
    },
  };
}

module.exports = { DuplicatePlateError, createCarRepository };
