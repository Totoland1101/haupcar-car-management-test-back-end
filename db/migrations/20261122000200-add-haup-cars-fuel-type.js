'use strict';

// What the car runs on: 'gasoline' | 'diesel' | 'hybrid' | 'plug_in_hybrid' | 'electric' | 'lpg' | 'ngv'.
// Empty for cars that already exist until someone edits them.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('haup_cars', 'fuel_type', { type: Sequelize.STRING(20), allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('haup_cars', 'fuel_type');
  },
};
