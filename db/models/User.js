// A login account. Who the person is lives in their Profile.
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
      // scrypt$<salt>$<hash>, written by src/auth/password.js
      password: {
        type: DataTypes.STRING(200),
        allowNull: false,
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
      // Created by db/migrations/20261121000000-create-haup-users-roles-permissions.js and changed
      // by 20261121000200 (registration status) and 20261121000400 (profiles, one password column)
      tableName: 'haup_users',
      // Queries leave out the password unless they ask for User.scope('withPassword').
      defaultScope: {
        attributes: { exclude: ['password'] },
      },
      scopes: {
        withPassword: {},
      },
    },
  );

  User.associate = (models) => {
    User.hasOne(models.Profile, { foreignKey: 'userId', as: 'profile' });
    User.belongsTo(models.User, { foreignKey: 'reviewedById', as: 'reviewedBy' });
  };

  return User;
};
