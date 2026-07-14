/**
 * Provider-agnostic abstraction — the payment/carrier `*ProviderPort`
 * precedent, adapted for a shape those don't need: media has multiple
 * *simultaneously active* sources (Unsplash, Dropbox, Google Drive,
 * OneDrive), not one provider chosen at boot via an env var. So instead of
 * a single injected `ExternalSourcePort`, `ExternalSourcesModule` builds a
 * registry (`source -> adapter instance`) and callers look one up by the
 * `source` value in the request. Every registered adapter still speaks
 * only this port — `FilesService`/`ExternalSourcesController` never know
 * they're talking to a mock.
 *
 * Real adapters (a keyed Unsplash API client, OAuth-backed cloud pickers)
 * are future drop-ins implementing this same port, registered into the
 * same map — no changes needed above the registry.
 */

export interface ExternalSearchResult {
  externalRef: string;
  name: string;
  mimeType: string;
  /** Not a real fetchable URL for the mock adapters — descriptive only, for a search-results list to render. */
  previewUrl: string;
}

export interface ExternalFetchResult {
  bytes: Buffer;
  mimeType: string;
  name: string;
}

export abstract class ExternalSourcePort {
  abstract search(query: string): Promise<ExternalSearchResult[]>;
  abstract fetch(externalRef: string): Promise<ExternalFetchResult>;
}
