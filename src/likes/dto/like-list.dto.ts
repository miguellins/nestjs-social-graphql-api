/**
 * Public Like DTO for list queries
 *
 * What it does:
 * - Defines the exact safe shape returned by the service
 * - Keeps service independent from GraphQL decorators
 * - Prevents accidental exposure of sensitive fields
 */

export type LikeListDTO = {
  id: number;
  createdAt: Date;

  user: {
    id: number;
    name: string;
    username: string;
  };

  post: {
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
};
