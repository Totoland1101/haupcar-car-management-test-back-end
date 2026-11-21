module.exports = (sequelize, DataTypes) => {
  const Department = sequelize.define(
    'Department',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
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
      // Created by db/migrations/20261121000400-split-haup-users-into-profiles.js
      tableName: 'haup_departments',
    },
  );

  Department.associate = (models) => {
    Department.hasMany(models.Profile, { foreignKey: 'departmentId', as: 'profiles' });
  };

  return Department;
};
