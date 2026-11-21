'use strict';

// Self-registration: people sign up on /register and wait for someone with the
// user.approve permission to let them in and pick their role.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      // 'pending' | 'approved' | 'rejected'. Accounts that already exist were made by an admin,
      // so they start out approved.
      await queryInterface.addColumn(
        'haup_users',
        'status',
        { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'approved' },
        { transaction },
      );
      await queryInterface.addColumn(
        'haup_users',
        'reviewed_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction },
      );
      // Who approved or rejected the registration, or created the account
      await queryInterface.addColumn(
        'haup_users',
        'reviewed_by',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'haup_users', key: 'id' },
          onDelete: 'SET NULL',
        },
        { transaction },
      );

      // A new registration has no role until it is approved.
      await queryInterface.sequelize.query('ALTER TABLE haup_users ALTER COLUMN role_id DROP NOT NULL', {
        transaction,
      });

      await queryInterface.addIndex('haup_users', ['status'], {
        name: 'idx_haup_users_status',
        transaction,
      });

      const now = new Date();
      await queryInterface.bulkInsert(
        'haup_permissions',
        [{ code: 'user.approve', name: 'Approve registrations', module: 'user', created_at: now, updated_at: now }],
        { transaction },
      );
      // System roles (Admin) have every permission, including this new one.
      await queryInterface.sequelize.query(
        `INSERT INTO haup_role_permissions (role_id, permission_id)
         SELECT r.id, p.id FROM haup_roles r, haup_permissions p
         WHERE r.is_system = true AND p.code = 'user.approve'`,
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
      // Removing the permission also removes it from every role (ON DELETE CASCADE).
      await queryInterface.bulkDelete('haup_permissions', { code: 'user.approve' }, { transaction });

      // Registrations that never got a role can't satisfy NOT NULL again, so they go.
      await queryInterface.bulkDelete('haup_users', { role_id: null }, { transaction });
      await queryInterface.sequelize.query('ALTER TABLE haup_users ALTER COLUMN role_id SET NOT NULL', {
        transaction,
      });

      await queryInterface.removeIndex('haup_users', 'idx_haup_users_status', { transaction });
      await queryInterface.removeColumn('haup_users', 'reviewed_by', { transaction });
      await queryInterface.removeColumn('haup_users', 'reviewed_at', { transaction });
      await queryInterface.removeColumn('haup_users', 'status', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
