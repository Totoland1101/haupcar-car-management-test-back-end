const { z } = require('zod');

const roleInputSchema = z.object({
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(50, 'Name must be at most 50 characters'),
  description: z
    .string({ error: 'Description must be text' })
    .trim()
    .max(200, 'Description must be at most 200 characters')
    .nullish()
    .transform((value) => value || null),
  // Permission codes, e.g. ['car.view', 'car.create']
  permissions: z.array(z.string(), { error: 'Permissions must be a list of permission codes' }).default([]),
});

module.exports = { roleInputSchema };
