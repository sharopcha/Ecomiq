/**
 * Matches `mapCategoryToStorefront()` exactly — the Category entity has no
 * `slug` or `description` field, so those do not exist on the wire despite
 * being on the frontend's old hand-written copy of this type.
 */
export interface StorefrontCategoryDto {
  id: string;
  name: string;
  parentId: string | null;
}
