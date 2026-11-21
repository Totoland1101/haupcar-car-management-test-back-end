// Permission codes the API checks. The rows in haup_permissions are created by
// db/migrations/20261121000100-insert-default-roles-and-permissions.js.
const PERMISSIONS = {
  CAR_VIEW: 'car.view',
  CAR_CREATE: 'car.create',
  CAR_UPDATE: 'car.update',
  CAR_DELETE: 'car.delete',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
};

module.exports = { PERMISSIONS };
