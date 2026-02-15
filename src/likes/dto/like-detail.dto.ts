export type LikeDetailDTO = {
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
