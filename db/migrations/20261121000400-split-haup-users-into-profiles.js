'use strict';

// haup_users keeps only what logging in needs. The person behind the account (name, contact
// details, job, department) and their role move to haup_profiles, one row per user.
// Departments get their own table. The password hash and its salt become one column.

const PASSWORD_PREFIX = 'scrypt';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    };

    try {
      await queryInterface.createTable(
        'haup_departments',
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
          name: { type: Sequelize.STRING(100), allowNull: false, unique: true },
          ...timestamps,
        },
        { transaction },
      );

      await queryInterface.createTable(
        'haup_profiles',
        {
          id: { type: Sequelize.INTEGER, primaryKey: true, allowNull: false, autoIncrement: true },
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            unique: true,
            references: { model: 'haup_users', key: 'id' },
            onDelete: 'CASCADE',
          },
          first_name: { type: Sequelize.STRING(100), allowNull: false },
          last_name: { type: Sequelize.STRING(100), allowNull: true },
          email: { type: Sequelize.STRING(255), allowNull: true },
          phone: { type: Sequelize.STRING(30), allowNull: true },
          job_title: { type: Sequelize.STRING(100), allowNull: true },
          department_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'haup_departments', key: 'id' },
            // Deleting a department leaves its people without one.
            onDelete: 'SET NULL',
          },
          // The role decides the permissions. Null while a registration waits for approval.
          role_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'haup_roles', key: 'id' },
            onDelete: 'RESTRICT',
          },
          ...timestamps,
        },
        { transaction },
      );
      await queryInterface.addIndex('haup_profiles', ['role_id'], { name: 'idx_haup_profiles_role_id', transaction });
      await queryInterface.addIndex('haup_profiles', ['department_id'], {
        name: 'idx_haup_profiles_department_id',
        transaction,
      });

      // One profile per existing user. "Somchai Jaidee" becomes first name "Somchai" and
      // last name "Jaidee". A single word stays a first name with no last name.
      await queryInterface.sequelize.query(
        `INSERT INTO haup_profiles (user_id, first_name, last_name, role_id, created_at, updated_at)
         SELECT id,
                split_part(btrim(name), ' ', 1),
                NULLIF(btrim(substr(btrim(name), length(split_part(btrim(name), ' ', 1)) + 1)), ''),
                role_id, created_at, updated_at
         FROM haup_users`,
        { transaction },
      );

      await queryInterface.addColumn(
        'haup_users',
        'password',
        { type: Sequelize.STRING(200), allowNull: true },
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE haup_users SET password = '${PASSWORD_PREFIX}$' || password_salt || '$' || password_hash`,
        { transaction },
      );
      await queryInterface.sequelize.query('ALTER TABLE haup_users ALTER COLUMN password SET NOT NULL', {
        transaction,
      });

      await queryInterface.removeColumn('haup_users', 'name', { transaction });
      await queryInterface.removeColumn('haup_users', 'role_id', { transaction });
      await queryInterface.removeColumn('haup_users', 'password_hash', { transaction });
      await queryInterface.removeColumn('haup_users', 'password_salt', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn('haup_users', 'name', { type: Sequelize.STRING(100), allowNull: true }, { transaction });
      await queryInterface.addColumn(
        'haup_users',
        'role_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'haup_roles', key: 'id' },
          onDelete: 'RESTRICT',
        },
        { transaction },
      );
      await queryInterface.addColumn(
        'haup_users',
        'password_hash',
        { type: Sequelize.STRING(128), allowNull: true },
        { transaction },
      );
      await queryInterface.addColumn(
        'haup_users',
        'password_salt',
        { type: Sequelize.STRING(32), allowNull: true },
        { transaction },
      );

      await queryInterface.sequelize.query(
        `UPDATE haup_users u
         SET name = btrim(p.first_name || ' ' || coalesce(p.last_name, '')), role_id = p.role_id
         FROM haup_profiles p WHERE p.user_id = u.id`,
        { transaction },
      );
      await queryInterface.sequelize.query(
        `UPDATE haup_users SET password_salt = split_part(password, '$', 2), password_hash = split_part(password, '$', 3)`,
        { transaction },
      );
      for (const column of ['name', 'password_hash', 'password_salt']) {
        await queryInterface.sequelize.query(`ALTER TABLE haup_users ALTER COLUMN ${column} SET NOT NULL`, {
          transaction,
        });
      }
      await queryInterface.addIndex('haup_users', ['role_id'], { name: 'idx_haup_users_role_id', transaction });

      await queryInterface.removeColumn('haup_users', 'password', { transaction });
      await queryInterface.dropTable('haup_profiles', { transaction });
      await queryInterface.dropTable('haup_departments', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
