'use strict';

// The app checks these permission codes (src/auth/permissions.js), so a migration creates them
// along with the default roles. The values are copied here, so this migration keeps working
// if the app code changes later.
const PERMISSIONS = [
  { code: 'car.view', name: 'View cars', module: 'car' },
  { code: 'car.create', name: 'Add cars', module: 'car' },
  { code: 'car.update', name: 'Edit cars', module: 'car' },
  { code: 'car.delete', name: 'Delete cars', module: 'car' },
  { code: 'user.manage', name: 'Manage users', module: 'user' },
  { code: 'role.manage', name: 'Manage roles and permissions', module: 'role' },
];

const ROLES = [
  {
    name: 'Admin',
    description: 'Full access, including users and roles',
    is_system: true,
    permissions: PERMISSIONS.map((p) => p.code),
  },
  {
    name: 'Staff',
    description: 'Adds and edits cars',
    is_system: false,
    permissions: ['car.view', 'car.create', 'car.update'],
  },
  {
    name: 'Viewer',
    description: 'Can only look at cars',
    is_system: false,
    permissions: ['car.view'],
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      const now = new Date();

      await queryInterface.bulkInsert(
        'haup_permissions',
        PERMISSIONS.map((p) => ({ ...p, created_at: now, updated_at: now })),
        { transaction },
      );
      await queryInterface.bulkInsert(
        'haup_roles',
        ROLES.map(({ permissions, ...role }) => ({ ...role, created_at: now, updated_at: now })),
        { transaction },
      );

      const [permissionRows] = await queryInterface.sequelize.query(
        'SELECT id, code FROM haup_permissions',
        { transaction },
      );
      const [roleRows] = await queryInterface.sequelize.query('SELECT id, name FROM haup_roles', {
        transaction,
      });
      const permissionId = Object.fromEntries(permissionRows.map((row) => [row.code, row.id]));
      const roleId = Object.fromEntries(roleRows.map((row) => [row.name, row.id]));

      await queryInterface.bulkInsert(
        'haup_role_permissions',
        ROLES.flatMap((role) =>
          role.permissions.map((code) => ({
            role_id: roleId[role.name],
            permission_id: permissionId[code],
          })),
        ),
        { transaction },
      );

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // Users point at roles, so they have to go first.
      await queryInterface.bulkDelete('haup_users', {}, { transaction });
      await queryInterface.bulkDelete('haup_role_permissions', {}, { transaction });
      await queryInterface.bulkDelete('haup_roles', {}, { transaction });
      await queryInterface.bulkDelete('haup_permissions', {}, { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
