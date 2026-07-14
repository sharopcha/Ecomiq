import {
  ExternalFetchResult,
  ExternalSearchResult,
  ExternalSourcePort,
} from './external-source.port';
import { generatePlaceholderBytes, generatePlaceholderImage } from './placeholder';

interface ManifestEntry {
  externalRef: string;
  name: string;
  mimeType: string;
}

/**
 * One class, three registered instances (dropbox/google_drive/one_drive —
 * see `external-sources.module.ts`) — the plan's own framing: "covers
 * dropbox/google_drive/one_drive" as a single adapter, not three. Each
 * instance gets its own fixed manifest (same shapes, source-labeled names)
 * rather than sharing one, so search/import results are visibly
 * distinguishable by picker in a demo or an admin UI. Non-image entries
 * (a PDF, a text file) are deliberate — proves the import path handles
 * arbitrary mime types, not just images the way Unsplash's mock does.
 */
export class MockCloudPickerAdapter extends ExternalSourcePort {
  private readonly manifest: ManifestEntry[];

  constructor(private readonly sourceLabel: 'dropbox' | 'google_drive' | 'one_drive') {
    super();
    this.manifest = [
      { externalRef: `${sourceLabel}-mock-1`, name: `${sourceLabel}-product-shot.jpg`, mimeType: 'image/jpeg' },
      { externalRef: `${sourceLabel}-mock-2`, name: `${sourceLabel}-spec-sheet.pdf`, mimeType: 'application/pdf' },
      { externalRef: `${sourceLabel}-mock-3`, name: `${sourceLabel}-notes.txt`, mimeType: 'text/plain' },
    ];
  }

  async search(query: string): Promise<ExternalSearchResult[]> {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? this.manifest.filter((entry) => entry.name.toLowerCase().includes(needle))
      : this.manifest;

    return matches.map((entry) => ({
      externalRef: entry.externalRef,
      name: entry.name,
      mimeType: entry.mimeType,
      previewUrl: `mock://${this.sourceLabel}/${entry.externalRef}`,
    }));
  }

  async fetch(externalRef: string): Promise<ExternalFetchResult> {
    const entry = this.manifest.find((candidate) => candidate.externalRef === externalRef);
    if (!entry) {
      throw new Error(`mock ${this.sourceLabel}: unknown externalRef "${externalRef}"`);
    }
    const bytes = entry.mimeType.startsWith('image/')
      ? await generatePlaceholderImage(externalRef)
      : generatePlaceholderBytes(externalRef, entry.mimeType);
    return { bytes, mimeType: entry.mimeType, name: entry.name };
  }
}
