// Fills the database with sample cars so the UI has something to show.
// Usage: npm run seed            (only when the table is empty)
//        npm run seed -- --reset (delete everything first)
const db = require('../db/models');

const sampleCars = [
  { registrationNumber: '1กก 1234', province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Yaris Ativ', year: 2023, color: 'White', mileage: 15200, status: 'available', notes: 'Spare key is in the office key cabinet.' },
  { registrationNumber: '2ขค 5678', province: 'กรุงเทพมหานคร', brand: 'Honda', model: 'City', year: 2022, color: 'Grey', mileage: 32850, status: 'in_use' },
  { registrationNumber: '3กษ 9012', province: 'เชียงใหม่', brand: 'Toyota', model: 'Camry', year: 2021, color: 'Black', mileage: 58400, status: 'maintenance', notes: 'Brake pads booked for replacement.' },
  { registrationNumber: '7กฮ 3456', province: 'ชลบุรี', brand: 'Mazda', model: '2', year: 2023, color: 'Red', mileage: 12010, status: 'available' },
  { registrationNumber: '4กร 7788', province: 'นนทบุรี', brand: 'MG', model: 'ZS EV', year: 2024, color: 'Blue', mileage: 8900, status: 'available', notes: 'EV. Charge to at least 80% before handing over.' },
  { registrationNumber: '5กง 2468', province: 'กรุงเทพมหานคร', brand: 'Nissan', model: 'Almera', year: 2020, color: 'Silver', mileage: 96500, status: 'inactive', notes: 'Waiting for the sale paperwork.' },
  { registrationNumber: '6กจ 1357', province: 'ภูเก็ต', brand: 'Honda', model: 'HR-V', year: 2024, color: 'White', mileage: 6400, status: 'in_use' },
  { registrationNumber: '8กต 8642', province: 'ขอนแก่น', brand: 'Toyota', model: 'Corolla Cross', year: 2023, color: 'Grey', mileage: 21780, status: 'available' },
  { registrationNumber: '9กน 1122', province: 'กรุงเทพมหานคร', brand: 'BYD', model: 'Atto 3', year: 2024, color: 'White', mileage: 11250, status: 'available', notes: 'EV. Type 2 charging cable in the trunk.' },
  { registrationNumber: '1กพ 3344', province: 'ปทุมธานี', brand: 'Suzuki', model: 'Swift', year: 2021, color: 'Yellow', mileage: 44100, status: 'maintenance', notes: 'Air conditioner is weak. Waiting for a check at the service centre.' },
  { registrationNumber: '2กม 5566', province: 'กรุงเทพมหานคร', brand: 'Toyota', model: 'Fortuner', year: 2022, color: 'Black', mileage: 39900, status: 'available' },
  { registrationNumber: '3กล 7799', province: 'ระยอง', brand: 'Isuzu', model: 'D-Max', year: 2023, color: 'White', mileage: 27300, status: 'in_use' },
];

async function main() {
  const reset = process.argv.includes('--reset');
  const { sequelize, Car } = db;

  const count = await Car.count();

  if (count > 0 && !reset) {
    console.log(`Database already has ${count} cars. Run "npm run seed -- --reset" to replace them.`);
  } else {
    await sequelize.transaction(async (transaction) => {
      if (reset) await Car.destroy({ truncate: true, restartIdentity: true, transaction });
      await Car.bulkCreate(sampleCars, { validate: true, transaction });
    });
    console.log(`Added ${sampleCars.length} sample cars to ${sequelize.getDatabaseName()}`);
  }

  await sequelize.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
