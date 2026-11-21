const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// scrypt is slow and memory-hard on purpose, so guessing passwords from a leaked hash is
// expensive. Every user gets a random salt, so two equal passwords never share a hash.
async function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return { salt, hash: hash.toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
  const actual = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(expectedHash, 'hex');
  // timingSafeEqual takes the same time however many bytes match.
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

// Checked against when the username doesn't exist, so a wrong username takes as long as a
// wrong password and response times don't reveal which usernames exist.
const dummyCredentials = hashPassword(crypto.randomBytes(16).toString('hex'));

async function verifyAgainstDummy(password) {
  const { salt, hash } = await dummyCredentials;
  await verifyPassword(password, salt, hash);
  return false;
}

module.exports = { hashPassword, verifyPassword, verifyAgainstDummy };
