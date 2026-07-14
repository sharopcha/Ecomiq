/**
 * S3 key-layout helpers (ECOMIQ-MEDIA-PLAN.md §1): originals live under
 * `stores/<storeId>/files/<fileId>/<sanitized-name>`, transforms under
 * `derived/<fileId>/<w>x<h>-<fit>.<ext>`. Pure functions — no I/O, no
 * dependency on TypeORM/entities (Phase 1 not built yet) — so they're
 * testable standalone from Step 10 onward without a database.
 */

/**
 * Strips path separators and anything outside a conservative safe set so a
 * user-supplied filename can never escape its own key prefix (no `../`, no
 * embedded slashes reinterpreted as folders) or break S3 key parsing.
 * Unicode letters/digits pass through; everything else collapses to `_`.
 */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  const base = trimmed.length > 0 ? trimmed : 'file';
  return base.replace(/[/\\]/g, '_').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 200);
}

export function buildOriginalKey(storeId: string, fileId: string, filename: string): string {
  return `stores/${storeId}/files/${fileId}/${sanitizeFilename(filename)}`;
}

export function buildDerivedKey(
  fileId: string,
  width: number,
  height: number,
  fit: string,
  ext: string,
): string {
  return `derived/${fileId}/${width}x${height}-${fit}.${ext}`;
}

/** Prefix covering every derivative of a file — used to bulk-clear them on delete (Step 6/7). */
export function buildDerivedPrefix(fileId: string): string {
  return `derived/${fileId}/`;
}
