'use strict';

// Up to one photo per side of each car, stored in the database with the car.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.createTable(
        'haup_car_photos',
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
          car_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'haup_cars', key: 'id' },
            onDelete: 'CASCADE',
          },
          // 'front' | 'left' | 'right' | 'back'
          side: { type: Sequelize.STRING(10), allowNull: false },
          content_type: { type: Sequelize.STRING(50), allowNull: false },
          size: { type: Sequelize.INTEGER, allowNull: false },
          data: { type: Sequelize.BLOB, allowNull: false },
          created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
          updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        },
        { transaction },
      );
      await queryInterface.addIndex('haup_car_photos', ['car_id', 'side'], {
        name: 'uq_haup_car_photos_car_id_side',
        unique: true,
        transaction,
      });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('haup_car_photos');
  },
};
