module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      passwordHash: {
        type: DataTypes.STRING(128),
        field: 'password_hash',
        allowNull: false,
      },
      passwordSalt: {
        type: DataTypes.STRING(32),
        field: 'password_salt',
        allowNull: false,
      },
      roleId: {
        type: DataTypes.INTEGER,
        field: 'role_id',
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        field: 'is_active',
        allowNull: false,
        defaultValue: true,
      },
      lastLoginAt: {
        type: DataTypes.DATE,
        field: 'last_login_at',
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
      // Created by db/migrations/20261121000000-create-haup-users-roles-permissions.js
      tableName: 'haup_users',
      // Queries leave out the password columns unless they ask for User.scope('withPassword').
      defaultScope: {
        attributes: { exclude: ['passwordHash', 'passwordSalt'] },
      },
      scopes: {
        withPassword: {},
      },
    },
  );

  User.associate = (models) => {
    User.belongsTo(models.Role, { foreignKey: 'roleId', as: 'role' });
  };

  return User;
};
