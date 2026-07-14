import { createHash } from 'node:crypto';
import sharp from 'sharp';

/**
 * Deterministic (same seed -> same bytes) placeholder image — real bytes,
 * not a stub, so an imported "photo" round-trips through the exact same
 * storage/HEAD-verification path a real upload does. Color is derived from
 * a hash of the seed rather than random, so imports are reproducible in
 * demos/tests.
 */
export async function generatePlaceholderImage(
  seed: string,
  width = 800,
  height = 600,
): Promise<Buffer> {
  const hash = createHash('sha256').update(seed).digest();
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: hash[0], g: hash[1], b: hash[2] },
    },
  })
    .jpeg()
    .toBuffer();
}

/** For non-image manifest entries (e.g. a mock cloud-picker PDF/text file) — deterministic bytes, not a real document, just enough to exercise the byte-handling path for a non-image mime. */
export function generatePlaceholderBytes(seed: string, mimeType: string): Buffer {
  return Buffer.from(`mock ${mimeType} content — seed:${seed}`, 'utf8');
}
