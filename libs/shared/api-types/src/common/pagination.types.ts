/**
 * Cursor pagination envelope used by any endpoint built on the shared
 * `paginate()` helper (see `libs/shared/typeorm/src/lib/pagination.ts`).
 * Not every list endpoint uses this — some (e.g. catalog's storefront
 * product list) use offset pagination instead with their own response
 * shape; those define their own envelope in their domain folder.
 */
export interface CursorPaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}
