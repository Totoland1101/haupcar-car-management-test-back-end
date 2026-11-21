const { z } = require('zod');
const { PROVINCES, normalizePlate } = require('./thai');

const CAR_STATUSES = ['available', 'in_use', 'maintenance', 'inactive'];
const FUEL_TYPES = ['gasoline', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'lpg', 'ngv'];

const SORTABLE_FIELDS = [
  'registrationNumber',
  'brand',
  'model',
  'year',
  'mileage',
  'registeredOn',
  'createdAt',
  'updatedAt',
];

const maxYear = new Date().getFullYear() + 1;

function requiredText(label, max) {
  return z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);
}

function optionalText(label, max) {
  return z
    .string({ error: `${label} must be text` })
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .nullish();
}

// YYYY-MM-DD in the server's time zone
function today() {
  return new Date().toLocaleDateString('en-CA');
}

function mileageField(label) {
  return z
    .number({ error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(0, `${label} cannot be negative`)
    .max(10_000_000, `${label} is too large`)
    .nullish();
}

const carInputSchema = z.object({
  registrationNumber: requiredText('Registration number', 20)
    .refine((value) => value === '' || normalizePlate(value) !== null, 'Use a Thai plate, for example 1กข 1234 or กข 1234')
    // "1กข1234" and "1กข  1234" should count as the same plate as "1กข 1234".
    .transform((value) => normalizePlate(value) ?? value),
  province: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.enum(PROVINCES, {
      error: (issue) => (issue.input ? 'Province must be one of the 77 Thai provinces' : 'Province is required'),
    })
  ),
  brand: requiredText('Brand', 50),
  model: requiredText('Model', 50),
  fuelType: z.enum(FUEL_TYPES, {
    error: (issue) =>
      issue.input === undefined || issue.input === null
        ? 'Fuel type is required'
        : `Fuel type must be one of: ${FUEL_TYPES.join(', ')}`,
  }),
  year: z
    .number({ error: 'Year must be a number' })
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(maxYear, `Year must be ${maxYear} or earlier`)
    .nullish(),
  color: optionalText('Color', 30),
  mileage: mileageField('Mileage'),
  // Left out, a new car gets today and an existing car keeps its date.
  registeredOn: z
    .string({ error: 'Registration date must be a date' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Registration date must look like 2026-11-22')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Registration date is not a real date')
    .refine((value) => value <= today(), 'Registration date cannot be in the future')
    .nullish(),
  registeredMileage: z
    .number({ error: 'Mileage at registration is required' })
    .int('Mileage at registration must be a whole number')
    .min(0, 'Mileage at registration cannot be negative')
    .max(10_000_000, 'Mileage at registration is too large'),
  status: z
    .enum(CAR_STATUSES, { error: `Status must be one of: ${CAR_STATUSES.join(', ')}` })
    .default('available'),
  notes: optionalText('Notes', 1000),
}).refine(
  (car) => car.mileage == null || car.registeredMileage == null || car.mileage >= car.registeredMileage,
  { path: ['mileage'], message: 'Mileage cannot be lower than the mileage at registration' }
);

const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(CAR_STATUSES).optional(),
  brand: z.string().trim().max(50).optional(),
  sortBy: z.enum(SORTABLE_FIELDS).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

module.exports = { CAR_STATUSES, FUEL_TYPES, SORTABLE_FIELDS, carInputSchema, listQuerySchema, today };
