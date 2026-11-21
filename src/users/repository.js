const { UniqueConstraintError } = require('sequelize');
const { hashPassword } = require('../auth/password');

class DuplicateUsernameError extends Error {}
class UnknownRoleError extends Error {}
// Approving an approved account, or rejecting one that isn't waiting
class RegistrationStateError extends Error {}

// The password hash and salt never leave this file.
function toUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    status: user.status,
    // null for a registration that hasn't been approved yet
    role: user.role ? { id: user.role.id, name: user.role.name } : null,
    reviewedAt: user.reviewedAt,
    reviewedBy: user.reviewedBy ? { id: user.reviewedBy.id, name: user.reviewedBy.name } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toAuthUser(user) {
  return {
    ...toUser(user),
    permissions: (user.role?.permissions ?? []).map((permission) => permission.code).sort(),
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
  const withReviewer = { model: User, as: 'reviewedBy', attributes: ['id', 'name'] };
  const withRoleAndPermissions = {
    ...withRole,
    include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }],
  };

  async function findById(id) {
    const user = await User.findByPk(id, { include: [withRole, withReviewer] });
    return user ? toUser(user) : null;
  }

  async function assertRoleExists(roleId) {
    const role = await Role.findByPk(roleId, { attributes: ['id'] });
    if (!role) throw new UnknownRoleError('This role does not exist');
  }

  return {
    findById,

    // Approved accounts. Registrations are listed by listRegistrations.
    async list() {
      const users = await User.findAll({
        where: { status: 'approved' },
        include: [withRole, withReviewer],
        order: [['username', 'ASC']],
      });
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

    // An account made by an admin is approved straight away.
    async create({ password, ...input }, { reviewerId }) {
      await assertRoleExists(input.roleId);
      const { hash, salt } = await hashPassword(password);
      try {
        const user = await User.create({
          ...input,
          passwordHash: hash,
          passwordSalt: salt,
          status: 'approved',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        });
        return findById(user.id);
      } catch (err) {
        rethrowDuplicate(err);
      }
    },

    // Someone signing up on /register. They can't log in until the account is approved.
    async register({ password, ...input }) {
      const { hash, salt } = await hashPassword(password);
      try {
        const user = await User.create({
          ...input,
          passwordHash: hash,
          passwordSalt: salt,
          status: 'pending',
          roleId: null,
        });
        return findById(user.id);
      } catch (err) {
        rethrowDuplicate(err);
      }
    },

    async listRegistrations(status) {
      const users = await User.findAll({
        where: { status },
        include: [withReviewer],
        // Oldest first, so the people who have waited longest are at the top
        order: [['createdAt', 'ASC']],
      });
      return users.map(toUser);
    },

    async registrationCounts() {
      const rows = await User.count({ where: { status: ['pending', 'rejected'] }, group: ['status'] });
      const counts = { pending: 0, rejected: 0 };
      for (const { status, count } of rows) counts[status] = count;
      return counts;
    },

    // A rejected registration can still be approved later, if the admin changes their mind.
    async approve(id, { roleId, reviewerId }) {
      const user = await User.findByPk(id);
      if (!user) return null;
      if (user.status === 'approved') throw new RegistrationStateError('This account is already approved');
      await assertRoleExists(roleId);

      await user.update({ status: 'approved', roleId, isActive: true, reviewedAt: new Date(), reviewedById: reviewerId });
      return findById(id);
    },

    async reject(id, { reviewerId }) {
      const user = await User.findByPk(id);
      if (!user) return null;
      if (user.status !== 'pending') {
        throw new RegistrationStateError('Only registrations that are waiting for approval can be rejected');
      }

      await user.update({ status: 'rejected', reviewedAt: new Date(), reviewedById: reviewerId });
      return findById(id);
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

module.exports = { DuplicateUsernameError, RegistrationStateError, UnknownRoleError, createUserRepository };
