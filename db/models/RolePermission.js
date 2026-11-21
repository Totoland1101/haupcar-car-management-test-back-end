// Join table between roles and permissions.
module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define(
    'RolePermission',
    {
      roleId: {
        type: DataTypes.INTEGER,
        field: 'role_id',
        primaryKey: true,
        allowNull: false,
      },
      permissionId: {
        type: DataTypes.INTEGER,
        field: 'permission_id',
        primaryKey: true,
        allowNull: false,
      },
    },
    {
      // Created by db/migrations/20261121000000-create-haup-users-roles-permissions.js
      tableName: 'haup_role_permissions',
      timestamps: false,
    },
  );

  return RolePermission;
};
