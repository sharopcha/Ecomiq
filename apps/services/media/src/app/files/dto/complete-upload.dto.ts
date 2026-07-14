import { PresignUploadDto } from './presign-upload.dto';

/**
 * Identical shape to `PresignUploadDto` — nothing is persisted between
 * presign and complete (the plan's "creates no row yet"), so the client
 * re-sends the same metadata it used to request the presigned URL. This
 * lets `FilesService.complete` recompute the exact same storage key
 * (`buildOriginalKey(storeId, fileId, name)`) and cross-check the real
 * `HEAD` against `declaredSizeBytes`/`mimeType` without the service having
 * to remember anything about the in-flight upload itself.
 */
export class CompleteUploadDto extends PresignUploadDto {}
