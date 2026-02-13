/**
 * Centralized rate-limit configuration
 *
 * limit - how many requests are allowed
 * ttl - time window in seconds
 *
 * Example
 * limit: 60, ttl: 60 = 60 requests every 60 seconds (1 minute)
 *
 * Protect from:
 * - brute force attacks
 * - bot traffic
 * - accidental client retry loops
 * - database overload
 * - destructive abuse
 */

export const THROTTLE_LIMITS = {
  /**
   * Used for list queries (users, posts, likes, follows)
   *
   * Protect from:
   * - data scraping
   * - crawling bots
   *
   * 60/min is generous for real users but restrictive for automated scripts
   */
  LIST: { limit: 60, ttl: 60 },

  /**
   * Used for single-record reads (userById, postById)
   *
   * These queries are usually cheaper:
   * - indexed lookup
   * - minimal joins
   * - predictable execution
   *
   * Protect from:
   * - id enumeration attacks - attackers looping through IDs
   */
  READ: { limit: 120, ttl: 60 },

  /**
   * Used for account creation
   *
   * Extremely important security control
   *
   * Protect from:
   * - bot signup floods
   * - spam accounts
   * - email abuse
   * - free-tier exploitation
   */
  SIGNUP: { limit: 5, ttl: 60 },

  /**
   * Used for normal authenticated mutations (update profile, like a post, follow user)
   *
   * Protect from:
   * - infinite retry loops from buggy clients
   * - mutation spam
   * - DB write amplification
   */
  MUTATION: { limit: 30, ttl: 60 },

  /**
   * Used for destructive operations (delete user, delete post)
   *
   * If abused, can cause irreversible damage
   *
   * Very strict - only 3 attempts every 5 minutes
   *
   * Protect from:
   * - compromised accounts
   * - rage scripts
   * - malicious automation
   */
  DESTRUCTIVE: { limit: 3, ttl: 300 },
} as const;
