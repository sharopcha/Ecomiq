/**
 * Event type strings for media-service's outbox rows, matching the repo
 * convention `<service>.<aggregate>.<verb>` (see
 * `apps/services/crm/src/app/events/crm-event-types.ts`).
 *
 * `file` is the only aggregate stream — `topicForAggregate('ecomiq',
 * 'media', MEDIA_FILE_AGGREGATE_TYPE)` -> `file.events`, `aggregateId =
 * fileAsset.id`. `file_folder` changes are never published (activity-log
 * only, see FoldersService) — this plan is a pure producer of *file*
 * events, not folder ones.
 */
export const FileEventType = {
  /** Published by FilesService.complete() once the uploaded object is verified. */
  FileCreated: 'media.file.created',
  /** Published by rename/move/other metadata updates. */
  FileUpdated: 'media.file.updated',
  /** Published by delete. */
  FileDeleted: 'media.file.deleted',
  /** Published by the external-source import flow, distinct from FileCreated since it's not an upload. */
  FileImported: 'media.file.imported',
} as const;

export const MEDIA_FILE_AGGREGATE_TYPE = 'file';
