module.exports = (sequelize, DataTypes) => {
  const CarPhoto = sequelize.define(
    'CarPhoto',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      carId: {
        type: DataTypes.INTEGER,
        field: 'car_id',
        allowNull: false,
      },
      side: {
        type: DataTypes.STRING(10),
        allowNull: false,
      },
      contentType: {
        type: DataTypes.STRING(50),
        field: 'content_type',
        allowNull: false,
      },
      /** Bytes */
      size: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      data: {
        type: DataTypes.BLOB,
        allowNull: false,
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
      // Created by db/migrations/20261122000100-create-haup-car-photos.js
      tableName: 'haup_car_photos',
      // Listing photos shouldn't pull every image out of the database.
      defaultScope: {
        attributes: { exclude: ['data'] },
      },
      scopes: {
        withData: {},
      },
    },
  );

  return CarPhoto;
};
