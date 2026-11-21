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
      // Null while a registration waits for approval
      roleId: {
        type: DataTypes.INTEGER,
        field: 'role_id',
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        field: 'is_active',
        allowNull: false,
        defaultValue: true,
      },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'approved',
        validate: { isIn: [['pending', 'approved', 'rejected']] },
      },
      reviewedAt: {
        type: DataTypes.DATE,
        field: 'reviewed_at',
        allowNull: true,
      },
      reviewedById: {
        type: DataTypes.INTEGER,
        field: 'reviewed_by',
        allowNull: true,
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
      // Created by db/migrations/20261121000000-create-haup-users-roles-permissions.js,
      // status and reviewed_* added by 20261121000200-add-haup-users-registration-status.js
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
    User.belongsTo(models.User, { foreignKey: 'reviewedById', as: 'reviewedBy' });
  };

  return User;
};
