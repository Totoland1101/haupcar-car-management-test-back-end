'use strict';

// Red plates (ป้ายแดง) are temporary plates for new cars that aren't registered yet. A red
// plate and a regular plate can carry the same number in the same province, so the
// unique index now includes the plate type.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn(
        'haup_cars',
        'is_red_plate',
        { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        { transaction },
      );
      await queryInterface.removeIndex('haup_cars', 'uq_haup_cars_registration_number_province', { transaction });
      await queryInterface.addIndex('haup_cars', ['registration_number', 'province', 'is_red_plate'], {
        name: 'uq_haup_cars_plate',
        unique: true,
        transaction,
      });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  // Fails if a red plate and a regular plate share a number and province, because the
  // old index can't hold both.
  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.removeIndex('haup_cars', 'uq_haup_cars_plate', { transaction });
      await queryInterface.addIndex('haup_cars', ['registration_number', 'province'], {
        name: 'uq_haup_cars_registration_number_province',
        unique: true,
        transaction,
      });
      await queryInterface.removeColumn('haup_cars', 'is_red_plate', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
