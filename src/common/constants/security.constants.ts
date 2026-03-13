/**
 * Cost factor used by bcrypt when hashing user passwords
 *
 * Higher values increase hash strength but also increase CPU time during signup
 * and password updates.
 */

export const SALT_ROUNDS = 12;
