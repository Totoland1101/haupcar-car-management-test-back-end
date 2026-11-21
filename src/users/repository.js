const { UniqueConstraintError } = require('sequelize');
const { hashPassword } = require('../auth/password');

class DuplicateUsernameError extends Error {}
class UnknownRoleError extends Error {}

// The password hash and salt never leave this file.
function toUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    role: { id: user.role.id, name: user.role.name },
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toAuthUser(user) {
  return {
    ...toUser(user),
    permissions: user.role.permissions.map((permission) => permission.code).sort(),
  };
}

function rethrowDuplicate(err) {
  if (err instanceof UniqueConstraintError) {
    throw new DuplicateUsernameError('A user with this username already exists');
  }
  throw err;
}

function createUserRepository({ User, Role, Permission }) {
  const withRole = { model: Role, as: 'role', attributes: ['id', 'name'] };
  const withRoleAndPermissions = {
    ...withRole,
    include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }],
  };

  async function findById(id) {
    const user = await User.findByPk(id, { include: [withRole] });
    return user ? toUser(user) : null;
  }

  async function assertRoleExists(roleId) {
    const role = await Role.findByPk(roleId, { attributes: ['id'] });
    if (!role) throw new UnknownRoleError('This role does not exist');
  }

  return {
    findById,

    async list() {
      const users = await User.findAll({ include: [withRole], order: [['username', 'ASC']] });
      return users.map(toUser);
    },

    // The logged-in user, with the permission codes of their role.
    async findAuthById(id) {
      const user = await User.findByPk(id, { include: [withRoleAndPermissions] });
      return user ? toAuthUser(user) : null;
    },

    async findForLogin(username) {
      const user = await User.scope('withPassword').findOne({
        where: { username },
        include: [withRoleAndPermissions],
      });
      if (!user) return null;
      return { user: toAuthUser(user), passwordHash: user.passwordHash, passwordSalt: user.passwordSalt };
    },

    async recordLogin(id) {
      // silent keeps updated_at for real changes to the account.
      await User.update({ lastLoginAt: new Date() }, { where: { id }, silent: true });
    },

    async create({ password, ...input }) {
      await assertRoleExists(input.roleId);
      const { hash, salt } = await hashPassword(password);
      try {
        const user = await User.create({ ...input, passwordHash: hash, passwordSalt: salt });
        return findById(user.id);
      } catch (err) {
        rethrowDuplicate(err);
      }
    },

    // Replaces the account details. The password changes only when a new one is given.
    async update(id, { password, ...input }) {
      const user = await User.findByPk(id);
      if (!user) return null;
      await assertRoleExists(input.roleId);

      const changes = {
        username: input.username,
        name: input.name,
        roleId: input.roleId,
        isActive: input.isActive,
      };
      if (password) {
        const { hash, salt } = await hashPassword(password);
        changes.passwordHash = hash;
        changes.passwordSalt = salt;
      }

      try {
        await user.update(changes);
      } catch (err) {
        rethrowDuplicate(err);
      }
      return findById(id);
    },

    async remove(id) {
      const deleted = await User.destroy({ where: { id } });
      return deleted > 0;
    },
  };
}

module.exports = { DuplicateUsernameError, UnknownRoleError, createUserRepository };
