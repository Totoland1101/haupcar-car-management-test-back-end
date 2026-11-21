'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

// Sample data for local development. Only inserted when NODE_ENV is development (the
// default), so a test or production database never gets the demo logins and their known
// passwords. Rows that already exist are left alone.

const SAMPLE_CARS = [
  { registration_number: '1กก 1234', province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Yaris Ativ', year: 2023, color: 'White', mileage: 15200, status: 'available', notes: 'Spare key is in the office key cabinet.' },
  { registration_number: '2ขค 5678', province: 'กรุงเทพมหานคร', brand: 'Honda', model: 'City', year: 2022, color: 'Grey', mileage: 32850, status: 'in_use', notes: null },
  { registration_number: '3กษ 9012', province: 'เชียงใหม่', brand: 'Toyota', model: 'Camry', year: 2021, color: 'Black', mileage: 58400, status: 'maintenance', notes: 'Brake pads booked for replacement.' },
  { registration_number: '7กฮ 3456', province: 'ชลบุรี', brand: 'Mazda', model: '2', year: 2023, color: 'Red', mileage: 12010, status: 'available', notes: null },
  { registration_number: '4กร 7788', province: 'นนทบุรี', brand: 'MG', model: 'ZS EV', year: 2024, color: 'Blue', mileage: 8900, status: 'available', notes: 'EV. Charge to at least 80% before handing over.' },
  { registration_number: '5กง 2468', province: 'กรุงเทพมหานคร', brand: 'Nissan', model: 'Almera', year: 2020, color: 'Silver', mileage: 96500, status: 'inactive', notes: 'Waiting for the sale paperwork.' },
  { registration_number: '6กจ 1357', province: 'ภูเก็ต', brand: 'Honda', model: 'HR-V', year: 2024, color: 'White', mileage: 6400, status: 'in_use', notes: null },
  { registration_number: '8กต 8642', province: 'ขอนแก่น', brand: 'Toyota', model: 'Corolla Cross', year: 2023, color: 'Grey', mileage: 21780, status: 'available', notes: null },
  { registration_number: '9กน 1122', province: 'กรุงเทพมหานคร', brand: 'BYD', model: 'Atto 3', year: 2024, color: 'White', mileage: 11250, status: 'available', notes: 'EV. Type 2 charging cable in the trunk.' },
  { registration_number: '1กพ 3344', province: 'ปทุมธานี', brand: 'Suzuki', model: 'Swift', year: 2021, color: 'Yellow', mileage: 44100, status: 'maintenance', notes: 'Air conditioner is weak. Waiting for a check at the service centre.' },
  { registration_number: '2กม 5566', province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Fortuner', year: 2022, color: 'Black', mileage: 39900, status: 'available', notes: null },
  { registration_number: '3กล 7799', province: 'ระยอง', brand: 'Isuzu', model: 'D-Max', year: 2023, color: 'White', mileage: 27300, status: 'in_use', notes: null },
];

const DEMO_USERS = [
  { username: 'admin', name: 'Admin', password: 'admin1234', role: 'Admin' },
  { username: 'staff', name: 'Staff member', password: 'staff1234', role: 'Staff' },
  { username: 'viewer', name: 'Viewer', password: 'viewer1234', role: 'Viewer' },
];

function isDevelopment() {
  return (process.env.NODE_ENV || 'development') === 'development';
}

// Same scheme as src/auth/password.js, copied so this migration doesn't depend on app code.
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return { salt, hash: hash.toString('hex') };
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if (!isDevelopment()) {
      console.log(`Skipping sample cars and demo users (NODE_ENV=${process.env.NODE_ENV})`);
      return;
    }

    const transaction = await queryInterface.sequelize.transaction();

    try {
      const now = new Date();

      await queryInterface.bulkInsert(
        'haup_cars',
        SAMPLE_CARS.map((car) => ({ ...car, created_at: now, updated_at: now })),
        { transaction, ignoreDuplicates: true },
      );

      const [roleRows] = await queryInterface.sequelize.query('SELECT id, name FROM haup_roles', {
        transaction,
      });
      const roleId = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));

      const users = [];
      for (const { password, role, ...user } of DEMO_USERS) {
        const { hash, salt } = await hashPassword(password);
        users.push({
          ...user,
          password_hash: hash,
          password_salt: salt,
          role_id: roleId[role],
          created_at: now,
          updated_at: now,
        });
      }
      await queryInterface.bulkInsert('haup_users', users, { transaction, ignoreDuplicates: true });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface, Sequelize) {
    const { Op } = Sequelize;
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.bulkDelete(
        'haup_cars',
        {
          [Op.or]: SAMPLE_CARS.map(({ registration_number, province }) => ({ registration_number, province })),
        },
        { transaction },
      );
      await queryInterface.bulkDelete(
        'haup_users',
        { username: DEMO_USERS.map((user) => user.username) },
        { transaction },
      );

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
