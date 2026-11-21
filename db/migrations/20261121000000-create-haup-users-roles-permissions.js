'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();

    const timestamps = {
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    };

    try {
      await queryInterface.createTable(
        'haup_permissions',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
          },
          // What the code checks, e.g. 'car.create'
          code: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
          },
          name: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          // Groups permissions in the role editor, e.g. 'car'
          module: {
            type: Sequelize.STRING(30),
            allowNull: false,
          },
          ...timestamps,
        },
        { transaction },
      );

      await queryInterface.createTable(
        'haup_roles',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
          },
          name: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
          },
          description: {
            type: Sequelize.STRING(200),
            allowNull: true,
          },
          // System roles (Admin) always have every permission and can't be edited or deleted.
          is_system: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
          },
          ...timestamps,
        },
        { transaction },
      );

      await queryInterface.createTable(
        'haup_role_permissions',
        {
          role_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'haup_roles', key: 'id' },
            onDelete: 'CASCADE',
          },
          permission_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            primaryKey: true,
            references: { model: 'haup_permissions', key: 'id' },
            onDelete: 'CASCADE',
          },
        },
        { transaction },
      );

      await queryInterface.createTable(
        'haup_users',
        {
          id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            allowNull: false,
            autoIncrement: true,
          },
          // Stored in lower case, so the unique index also ignores case.
          username: {
            type: Sequelize.STRING(50),
            allowNull: false,
            unique: true,
          },
          name: {
            type: Sequelize.STRING(100),
            allowNull: false,
          },
          // scrypt output (64 bytes) and its random salt (16 bytes), both hex-encoded.
          password_hash: {
            type: Sequelize.STRING(128),
            allowNull: false,
          },
          password_salt: {
            type: Sequelize.STRING(32),
            allowNull: false,
          },
          role_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'haup_roles', key: 'id' },
            // A role can't be deleted while users still have it.
            onDelete: 'RESTRICT',
          },
          is_active: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
          },
          last_login_at: {
            type: Sequelize.DATE,
            allowNull: true,
          },
          ...timestamps,
        },
        { transaction },
      );

      await queryInterface.addIndex('haup_users', ['role_id'], {
        name: 'idx_haup_users_role_id',
        transaction,
      });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.dropTable('haup_users', { transaction });
      await queryInterface.dropTable('haup_role_permissions', { transaction });
      await queryInterface.dropTable('haup_roles', { transaction });
      await queryInterface.dropTable('haup_permissions', { transaction });

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  },
};
