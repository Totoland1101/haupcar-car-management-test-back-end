const { CAR_STATUSES } = require('../../src/cars/schema');

module.exports = (sequelize, DataTypes) => {
  const Car = sequelize.define(
    'Car',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      registrationNumber: {
        type: DataTypes.STRING(20),
        field: 'registration_number',
        allowNull: false,
      },
      province: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      brand: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      model: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      year: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      mileage: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // The day the car was registered in the system, and its mileage then
      registeredOn: {
        type: DataTypes.DATEONLY,
        field: 'registered_on',
        allowNull: false,
      },
      registeredMileage: {
        type: DataTypes.INTEGER,
        field: 'registered_mileage',
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'available',
        validate: { isIn: [CAR_STATUSES] },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        field: 'updated_at',
      },
    },
    {
      // Created by db/migrations/20261120000000-create-haup-cars.js
      tableName: 'haup_cars',
    },
  );

  return Car;
};
