const { UniqueConstraintError } = require('sequelize');
const { hashPassword, verifyPassword } = require('../auth/password');

class DuplicateUsernameError extends Error {}
class UnknownRoleError extends Error {}
class UnknownDepartmentError extends Error {}
// Approving an approved account, or rejecting one that isn't waiting
class RegistrationStateError extends Error {}

function fullName(profile) {
  return profile ? [profile.firstName, profile.lastName].filter(Boolean).join(' ') : null;
}

// The password never leaves this file.
function toUser(user) {
  const { profile } = user;
  return {
    id: user.id,
    username: user.username,
    // First and last name together, for display
    name: fullName(profile),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    status: user.status,
    // Stored on the profile. null for a registration that hasn't been approved yet.
    role: profile?.role ? { id: profile.role.id, name: profile.role.name } : null,
    profile: profile
      ? {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone,
          jobTitle: profile.jobTitle,
          department: profile.department ? { id: profile.department.id, name: profile.department.name } : null,
        }
      : null,
    reviewedAt: user.reviewedAt,
    reviewedBy: user.reviewedBy ? { id: user.reviewedBy.id, name: fullName(user.reviewedBy.profile) } : null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function toAuthUser(user) {
  return {
    ...toUser(user),
    permissions: (user.profile?.role?.permissions ?? []).map((permission) => permission.code).sort(),
  };
}

function rethrowDuplicate(err) {
  if (err instanceof UniqueConstraintError) {
    throw new DuplicateUsernameError('A user with this username already exists');
  }
  throw err;
}

// Profile columns a request may set. The role is handled separately because only admins set it.
function profileFields({ firstName, lastName, email, phone, jobTitle, departmentId }) {
  return { firstName, lastName, email, phone, jobTitle, departmentId };
}

function createUserRepository({ User, Profile, Role, Department, Permission, sequelize }) {
  const roleInclude = { model: Role, as: 'role', attributes: ['id', 'name'] };
  const withProfile = {
    model: Profile,
    as: 'profile',
    include: [roleInclude, { model: Department, as: 'department', attributes: ['id', 'name'] }],
  };
  const withProfileAndPermissions = {
    ...withProfile,
    include: [
      {
        ...roleInclude,
        include: [{ model: Permission, as: 'permissions', attributes: ['code'], through: { attributes: [] } }],
      },
      { model: Department, as: 'department', attributes: ['id', 'name'] },
    ],
  };
  const withReviewer = {
    model: User,
    as: 'reviewedBy',
    attributes: ['id'],
    include: [{ model: Profile, as: 'profile', attributes: ['firstName', 'lastName'] }],
  };

  async function findById(id) {
    const user = await User.findByPk(id, { include: [withProfile, withReviewer] });
    return user ? toUser(user) : null;
  }

  async function findAuthById(id) {
    const user = await User.findByPk(id, { include: [withProfileAndPermissions] });
    return user ? toAuthUser(user) : null;
  }

  async function assertRoleExists(roleId) {
    const role = await Role.findByPk(roleId, { attributes: ['id'] });
    if (!role) throw new UnknownRoleError('This role does not exist');
  }

  async function assertDepartmentExists(departmentId) {
    if (!departmentId) return;
    const department = await Department.findByPk(departmentId, { attributes: ['id'] });
    if (!department) throw new UnknownDepartmentError('This department does not exist');
  }

  // Creates the account and its profile together, so neither exists without the other.
  async function createWithProfile(account, profile) {
    try {
      const id = await sequelize.transaction(async (transaction) => {
        const user = await User.create(account, { transaction });
        await Profile.create({ ...profile, userId: user.id }, { transaction });
        return user.id;
      });
      return findById(id);
    } catch (err) {
      rethrowDuplicate(err);
    }
  }

  return {
    findById,
    findAuthById,

    // Approved accounts. Registrations are listed by listRegistrations.
    async list() {
      const users = await User.findAll({
        where: { status: 'approved' },
        include: [withProfile, withReviewer],
        order: [['username', 'ASC']],
      });
      return users.map(toUser);
    },

    async findForLogin(username) {
      const user = await User.scope('withPassword').findOne({
        where: { username },
        include: [withProfileAndPermissions],
      });
      if (!user) return null;
      return { user: toAuthUser(user), password: user.password };
    },

    async recordLogin(id) {
      // silent keeps updated_at for real changes to the account.
      await User.update({ lastLoginAt: new Date() }, { where: { id }, silent: true });
    },

    // An account made by an admin is approved straight away.
    async create({ password, roleId, profile, ...account }, { reviewerId }) {
      await assertRoleExists(roleId);
      await assertDepartmentExists(profile.departmentId);
      return createWithProfile(
        {
          ...account,
          password: await hashPassword(password),
          status: 'approved',
          reviewedAt: new Date(),
          reviewedById: reviewerId,
        },
        { ...profileFields(profile), roleId }
      );
    },

    // Someone signing up on /register. They can't log in until the account is approved.
    async register({ password, username, profile }) {
      return createWithProfile(
        { username, password: await hashPassword(password), status: 'pending' },
        { ...profileFields(profile), roleId: null }
      );
    },

    // Replaces the account and profile details. The password changes only when a new one is given.
    async update(id, { password, roleId, profile, ...account }) {
      const user = await User.findByPk(id, { include: [{ model: Profile, as: 'profile' }] });
      if (!user) return null;
      await assertRoleExists(roleId);
      await assertDepartmentExists(profile.departmentId);

      const changes = { username: account.username, isActive: account.isActive };
      if (password) changes.password = await hashPassword(password);

      try {
        await sequelize.transaction(async (transaction) => {
          await user.update(changes, { transaction });
          await user.profile.update({ ...profileFields(profile), roleId }, { transaction });
        });
      } catch (err) {
        rethrowDuplicate(err);
      }
      return findById(id);
    },

    // A user editing their own details. The role stays as it is.
    async updateProfile(userId, profile) {
      await assertDepartmentExists(profile.departmentId);
      await Profile.update(profileFields(profile), { where: { userId } });
      return findAuthById(userId);
    },

    // Returns false when the user doesn't exist.
    async setPassword(id, password) {
      const [updated] = await User.update({ password: await hashPassword(password) }, { where: { id } });
      return updated > 0;
    },

    async checkPassword(id, password) {
      const user = await User.scope('withPassword').findByPk(id, { attributes: ['id', 'password'] });
      return Boolean(user) && verifyPassword(password, user.password);
    },

    async remove(id) {
      // The profile goes with it (ON DELETE CASCADE).
      const deleted = await User.destroy({ where: { id } });
      return deleted > 0;
    },

    async listRegistrations(status) {
      const users = await User.findAll({
        where: { status },
        include: [withProfile, withReviewer],
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
      const user = await User.findByPk(id, { include: [{ model: Profile, as: 'profile' }] });
      if (!user) return null;
      if (user.status === 'approved') throw new RegistrationStateError('This account is already approved');
      await assertRoleExists(roleId);

      await sequelize.transaction(async (transaction) => {
        await user.update(
          { status: 'approved', isActive: true, reviewedAt: new Date(), reviewedById: reviewerId },
          { transaction }
        );
        await user.profile.update({ roleId }, { transaction });
      });
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
  };
}

module.exports = {
  DuplicateUsernameError,
  RegistrationStateError,
  UnknownDepartmentError,
  UnknownRoleError,
  createUserRepository,
};
