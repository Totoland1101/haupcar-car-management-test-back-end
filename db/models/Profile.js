// The person behind an account: name, contact details, job, department and role.
// One row per user, created together with the user.
module.exports = (sequelize, DataTypes) => {
  const Profile = sequelize.define(
    'Profile',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.INTEGER,
        field: 'user_id',
        allowNull: false,
        unique: true,
      },
      firstName: {
        type: DataTypes.STRING(100),
        field: 'first_name',
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING(100),
        field: 'last_name',
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      jobTitle: {
        type: DataTypes.STRING(100),
        field: 'job_title',
        allowNull: true,
      },
      departmentId: {
        type: DataTypes.INTEGER,
        field: 'department_id',
        allowNull: true,
      },
      // Null while a registration waits for approval
      roleId: {
        type: DataTypes.INTEGER,
        field: 'role_id',
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
      // Created by db/migrations/20261121000400-split-haup-users-into-profiles.js
      tableName: 'haup_profiles',
    },
  );

  Profile.associate = (models) => {
    Profile.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Profile.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
    Profile.belongsTo(models.Department, { foreignKey: 'departmentId', as: 'department' });
  };

  return Profile;
};
