const { z } = require('zod');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[0-9+\-() ]+$/;

function requiredText(label, max) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

// Blank text is stored as null.
function optionalText(label, max) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullish()
    .transform((value) => value || null);
}

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

// The person's details. Anyone can edit their own through /api/auth/me/profile.
const profileSchema = z.object(
  {
    firstName: requiredText('First name', 100),
    lastName: optionalText('Last name', 100),
    email: optionalText('Email', 255).refine((value) => !value || EMAIL.test(value), 'Email is not valid'),
    phone: optionalText('Phone', 30).refine(
      (value) => !value || PHONE.test(value),
      'Phone can only contain digits, spaces and + - ( )'
    ),
    jobTitle: optionalText('Job title', 100),
    departmentId: z.number({ error: 'Department must be an id' }).int().positive().nullish().transform((v) => v ?? null),
  },
  { error: 'Profile is required' }
);

const userCreateSchema = z.object({
  username,
  password,
  roleId: z.number({ error: 'Role is required' }).int().positive('Role is required'),
  isActive: z.boolean({ error: 'Active must be true or false' }).default(true),
  profile: profileSchema,
});

// Same fields, but the password is optional. Leaving it out keeps the current one.
const userUpdateSchema = userCreateSchema.extend({
  password: password.nullish(),
});

// What someone fills in on /register. Job title and department come later.
const registerSchema = z.object({
  username,
  password,
  profile: profileSchema.pick({ firstName: true, lastName: true, email: true, phone: true }),
});

module.exports = { profileSchema, registerSchema, userCreateSchema, userUpdateSchema };
