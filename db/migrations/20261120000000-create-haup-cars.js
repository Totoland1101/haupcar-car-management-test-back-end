'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'haup_cars',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
          },
          registration_number: {
            type: Sequelize.STRING(20),
            allowNull: false,
          },
          province: {
            type: Sequelize.STRING(50),
            allowNull: false,
          },
          brand: {
            type: Sequelize.STRING(50),
            allowNull: false,
          },
          model: {
            type: Sequelize.STRING(50),
            allowNull: false,
          },
          year: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          color: {
            type: Sequelize.STRING(30),
            allowNull: true,
          },
          mileage: {
            type: Sequelize.INTEGER,
            allowNull: true,
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'available',
            // 'available' | 'in_use' | 'maintenance' | 'inactive'
          },
          notes: {
            type: Sequelize.TEXT,
            allowNull: true,
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.fn('NOW'),
          },
        },
        { transaction },
      );

      // Thai plates are only unique within a province.
      await queryInterface.addIndex('haup_cars', ['registration_number', 'province'], {
        name: 'uq_haup_cars_registration_number_province',
        unique: true,
        transaction,
      });

      await queryInterface.addIndex('haup_cars', ['status'], {
        name: 'idx_haup_cars_status',
        transaction,
      });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('haup_cars', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
