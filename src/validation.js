const { z } = require('zod');
const { HttpError } = require('./errors');

// Parses `input` with a Zod schema, or throws a 400 with one detail per invalid field.
function validate(schema, input, message = 'Validation failed') {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new HttpError(400, message, details);
  }
  return result.data;
}

const idSchema = z.coerce.number().int().positive();

function parseId(raw, label) {
  const result = idSchema.safeParse(raw);
  if (!result.success) throw new HttpError(400, `${label} id must be a positive whole number`);
  return result.data;
}

module.exports = { validate, parseId };
