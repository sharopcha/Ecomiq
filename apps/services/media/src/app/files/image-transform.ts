/**
 * Pure functions, no I/O — keeps the derivative key space bounded
 * (`clampDimension`) and validates the `fit` query param without ever
 * touching sharp or MinIO. `TransformsService`/`FilesController` are the
 * only things that call sharp directly.
 */

export type TransformFit = 'cover' | 'contain';

export function isValidFit(value: string): value is TransformFit {
  return value === 'cover' || value === 'contain';
}

/** Clamps to [1, maxDimension] — a non-finite or non-positive input clamps to 1, not to maxDimension, so a garbage value never silently becomes "the biggest possible derivative". */
export function clampDimension(value: number, maxDimension: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.min(Math.round(value), maxDimension);
}
