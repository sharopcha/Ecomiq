/**
 * Every app's main.ts imports 'reflect-metadata' before anything else loads,
 * which is what makes decorator metadata (class-validator's @IsInt etc.,
 * TypeORM's @Column etc.) work at runtime. Jest has no main.ts, so any spec
 * that transitively imports a decorated class needs this polyfill loaded
 * first — hence `setupFiles` in every project's jest.config.ts pointing here.
 */
import 'reflect-metadata';
