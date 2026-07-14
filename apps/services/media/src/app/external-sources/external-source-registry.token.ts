import { ExternalSourcePort } from './external-source.port';

/**
 * Split out from external-sources.module.ts on purpose — the module file
 * imports `ExternalSourcesController`, and the controller needs this
 * token, so declaring the token in the module file created a circular
 * import between the two (module -> controller -> module) that left the
 * token `undefined` at runtime in some load orders (`Nest can't resolve
 * dependencies of ExternalSourcesController` — a real boot failure caught
 * by `media:external-sources-demo`, not by `tsc`, since the type-only
 * usage compiled fine either way).
 */
export const EXTERNAL_SOURCE_REGISTRY = Symbol('EXTERNAL_SOURCE_REGISTRY');
export type ExternalSourceRegistry = ReadonlyMap<string, ExternalSourcePort>;
