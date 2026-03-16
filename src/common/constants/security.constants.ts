/**
 * Shared password security constants
 *
 * Defines the hashing settings used by authentication
 */

/**
 * bcrypt cost factor used when hashing user passwords
 *
 * This controls the work factor for bcrypt's internally generated salt
 * It is not a literal shared salt value
 */
export const SALT_ROUNDS = 12;

/**
 * Prefix stored before peppered bcrypt hashes
 *
 * Allows the application to distinguish the current hash format from legacy
 * bcrypt-only hashes and upgrade older passwords after successful login
 */
export const PASSWORD_HASH_PREFIX = "bcrypt+hmac-sha256:v1$";
