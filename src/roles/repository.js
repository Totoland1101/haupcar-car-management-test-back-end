const { ForeignKeyConstraintError, UniqueConstraintError } = require('sequelize');

class DuplicateRoleNameError extends Error {}
class SystemRoleError extends Error {}

class RoleInUseError extends Error {
  constructor(userCount) {
    super(`${userCount} ${userCount === 1 ? 'user still has' : 'users still have'} this role. Give them another role first.`);
  }
}

class UnknownPermissionError extends Error {
  constructor(codes) {
    super(`Unknown permission: ${codes.join(', ')}`);
  }
}

function createRoleRepository({ Role, Permission, Profile, sequelize }) {
  const withPermissions = {
    model: Permission,
    as: 'permissions',
    attributes: ['id', 'code'],
    through: { attributes: [] },
  };

  async function userCounts() {
    // A user's role is stored on their profile.
    const rows = await Profile.count({ group: ['roleId'] });
    return new Map(rows.map((row) => [row.roleId, row.count]));
  }

  function toRole(role, counts) {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((permission) => permission.code).sort(),
      userCount: counts.get(role.id) ?? 0,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async function findById(id) {
    const role = await Role.findByPk(id, { include: [withPermissions] });
    return role ? toRole(role, await userCounts()) : null;
  }

  async function findPermissions(codes, transaction) {
    const unique = [...new Set(codes)];
    const found = await Permission.findAll({ where: { code: unique }, transaction });
    if (found.length !== unique.length) {
      const known = new Set(found.map((permission) => permission.code));
      throw new UnknownPermissionError(unique.filter((code) => !known.has(code)));
    }
    return found;
  }

  async function save(role, { permissions, ...fields }) {
    try {
      await sequelize.transaction(async (transaction) => {
        const found = await findPermissions(permissions, transaction);
        await role.set(fields).save({ transaction });
        await role.setPermissions(found, { transaction });
      });
    } catch (err) {
      if (err instanceof UniqueConstraintError) {
        throw new DuplicateRoleNameError('A role with this name already exists');
      }
      throw err;
    }
    return findById(role.id);
  }

  return {
    findById,

    async list() {
      const [roles, counts] = await Promise.all([
        Role.findAll({
          include: [withPermissions],
          order: [
            ['isSystem', 'DESC'],
            ['name', 'ASC'],
          ],
        }),
        userCounts(),
      ]);
      return roles.map((role) => toRole(role, counts));
    },

    async listPermissions() {
      const permissions = await Permission.findAll({ order: [['id', 'ASC']] });
      return permissions.map(({ code, name, module }) => ({ code, name, module }));
    },

    async create(input) {
      return save(Role.build(), input);
    },

    async update(id, input) {
      const role = await Role.findByPk(id);
      if (!role) return null;
      if (role.isSystem) throw new SystemRoleError('System roles cannot be changed');
      return save(role, input);
    },

    async remove(id) {
      const role = await Role.findByPk(id);
      if (!role) return false;
      if (role.isSystem) throw new SystemRoleError('System roles cannot be deleted');

      const userCount = await Profile.count({ where: { roleId: id } });
      if (userCount > 0) throw new RoleInUseError(userCount);

      try {
        await role.destroy();
      } catch (err) {
        // A user was given this role between the count and the delete.
        if (err instanceof ForeignKeyConstraintError) {
          throw new RoleInUseError(await Profile.count({ where: { roleId: id } }));
        }
        throw err;
      }
      return true;
    },
  };
}

module.exports = {
  DuplicateRoleNameError,
  RoleInUseError,
  SystemRoleError,
  UnknownPermissionError,
  createRoleRepository,
};
