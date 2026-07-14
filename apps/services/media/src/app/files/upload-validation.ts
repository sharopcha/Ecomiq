/**
 * Pure functions, no I/O — used both at presign time (reject obviously bad
 * requests before MinIO is ever touched) and at complete time (cross-check
 * the real object against what was declared).
 */

export function parseAllowedMimePrefixes(raw: string): string[] {
  return raw
    .split(',')
    .map((prefix) => prefix.trim())
    .filter((prefix) => prefix.length > 0);
}

export function isMimeAllowed(mimeType: string, allowedPrefixes: readonly string[]): boolean {
  return allowedPrefixes.some((prefix) => mimeType.startsWith(prefix));
}

export function isSizeAllowed(sizeBytes: number, maxSizeBytes: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= maxSizeBytes;
}
