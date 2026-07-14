import {
  ExternalFetchResult,
  ExternalSearchResult,
  ExternalSourcePort,
} from './external-source.port';
import { generatePlaceholderImage } from './placeholder';

interface CatalogEntry {
  externalRef: string;
  name: string;
  keywords: string[];
}

/**
 * Fixed, deterministic result set — no real Unsplash account/API key exists
 * yet. `search` substring-matches `query` against name/keywords;
 * `fetch` generates a real (sharp) placeholder JPEG so an import produces
 * real bytes in MinIO, not a stub row. A real `UnsplashAdapter` (keyed API,
 * live search) implementing the same `ExternalSourcePort` is a future
 * drop-in registered alongside this one.
 */
export class MockUnsplashAdapter extends ExternalSourcePort {
  private readonly catalog: CatalogEntry[] = [
    { externalRef: 'unsplash-mock-1', name: 'mountain-lake.jpg', keywords: ['mountain', 'lake', 'nature'] },
    { externalRef: 'unsplash-mock-2', name: 'city-skyline.jpg', keywords: ['city', 'skyline', 'urban'] },
    { externalRef: 'unsplash-mock-3', name: 'coffee-desk.jpg', keywords: ['coffee', 'desk', 'workspace'] },
    { externalRef: 'unsplash-mock-4', name: 'ocean-sunset.jpg', keywords: ['ocean', 'sunset', 'beach'] },
    { externalRef: 'unsplash-mock-5', name: 'forest-path.jpg', keywords: ['forest', 'path', 'nature'] },
  ];

  async search(query: string): Promise<ExternalSearchResult[]> {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? this.catalog.filter(
          (entry) =>
            entry.name.toLowerCase().includes(needle) ||
            entry.keywords.some((keyword) => keyword.includes(needle)),
        )
      : this.catalog;

    return matches.map((entry) => ({
      externalRef: entry.externalRef,
      name: entry.name,
      mimeType: 'image/jpeg',
      previewUrl: `mock://unsplash/${entry.externalRef}`,
    }));
  }

  async fetch(externalRef: string): Promise<ExternalFetchResult> {
    const entry = this.catalog.find((candidate) => candidate.externalRef === externalRef);
    if (!entry) {
      throw new Error(`mock unsplash: unknown externalRef "${externalRef}"`);
    }
    const bytes = await generatePlaceholderImage(externalRef);
    return { bytes, mimeType: 'image/jpeg', name: entry.name };
  }
}
