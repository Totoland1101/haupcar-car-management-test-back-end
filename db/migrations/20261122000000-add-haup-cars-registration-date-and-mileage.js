'use strict';

// When the car was registered in the system, and its mileage on that day. The mileage
// column keeps the current reading.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'haup_cars',
        'registered_on',
        { type: Sequelize.DATEONLY, allowNull: true },
        { transaction },
      );
      // Cars that already exist were registered the day they were added.
      await queryInterface.sequelize.query('UPDATE haup_cars SET registered_on = created_at::date', { transaction });
      await queryInterface.sequelize.query(
        'ALTER TABLE haup_cars ALTER COLUMN registered_on SET NOT NULL, ALTER COLUMN registered_on SET DEFAULT CURRENT_DATE',
        { transaction },
      );

      // Unknown for cars that already exist, so it starts empty.
      await queryInterface.addColumn(
        'haup_cars',
        'registered_mileage',
        { type: Sequelize.INTEGER, allowNull: true },
        { transaction },
      );

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeColumn('haup_cars', 'registered_mileage', { transaction });
      await queryInterface.removeColumn('haup_cars', 'registered_on', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
