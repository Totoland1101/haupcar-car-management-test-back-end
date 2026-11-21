const { z } = require('zod');

const username = z
  .string({ error: 'Username is required' })
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters')
  .max(50, 'Username must be at most 50 characters')
  .regex(/^[a-z0-9._-]+$/, 'Username can only contain letters, numbers, dots, dashes and underscores');

const password = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const userCreateSchema = z.object({
  username,
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  password,
  roleId: z.number({ error: 'Role is required' }).int().positive('Role is required'),
  isActive: z.boolean({ error: 'Active must be true or false' }).default(true),
});

// Same fields, but the password is optional. Leaving it out keeps the current one.
const userUpdateSchema = userCreateSchema.extend({
  password: password.nullish(),
});

module.exports = { userCreateSchema, userUpdateSchema };
