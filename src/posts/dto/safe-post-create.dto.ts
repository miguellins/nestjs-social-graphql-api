/**
 * Safe representation of a Post returned immediately after creation
 *
 * What it does:
 * - Exposes only the fields required by the client
 * - Prevents leaking internal database structure
 * - Creates a predictable response shape
 * - Includes minimal relational data for better UX
 *
 * Why it exists:
 * - Avoids returning the raw Prisma Post model
 * - Enforces a clear contract between the service layer and API
 * - Improves long-term maintainability
 * - Reduces accidental data exposure
 *
 * Design decision:
 * - This DTO returns only a lightweight author preview instead of the full User
 * object to keep the response fast and scalable
 *
 * Performance benefit:
 * - '_count.likes' allows the client to immediately display engagement metrics
 * without triggering additional queries
 *
 * Important:
 * - This type should be used only for post-creation responses
 */

export type SafePostCreateDTO = {
  id: number;
  title: string;
  content: string;
  createdAt: Date;

  author: {
    id: number;
    name: string;
    username: string;
  };

  _count: {
    likes: number;
  };
};
