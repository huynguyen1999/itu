export interface CursorPageOptions {
  limit?: number;
  cursor?: string;
  q?: string;
}

export interface CursorPage<T> {
  data: T[];
  meta: {
    nextCursor?: string | null;
    hasNextPage: boolean;
  };
}
