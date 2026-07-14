import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'node:stream';
import { MEDIA_S3_INTERNAL_CLIENT, MEDIA_S3_PUBLIC_CLIENT } from './s3-clients';

// Matches the presign PUT expiry the upload flow (Step 5) will use — kept
// here as the shared default so every presign call agrees unless a caller
// has a specific reason to override it.
const DEFAULT_PRESIGN_EXPIRY_SECONDS = 15 * 60;

export interface HeadResult {
  sizeBytes: number;
  contentType?: string;
}

/**
 * Thin wrapper over the AWS S3 SDK (bucket name resolved once from
 * `MEDIA_S3_BUCKET`) — every other module in this service goes through
 * this, never touches `S3Client` directly, so the internal-vs-public
 * client split (s3-clients.ts) only has to be gotten right in one place.
 */
@Injectable()
export class StorageService {
  private readonly bucket: string;

  constructor(
    @Inject(MEDIA_S3_INTERNAL_CLIENT) private readonly internalClient: S3Client,
    @Inject(MEDIA_S3_PUBLIC_CLIENT) private readonly publicClient: S3Client,
    private readonly config: ConfigService,
  ) {
    this.bucket = this.config.get<string>('MEDIA_S3_BUCKET', 'ecomiq-media');
  }

  /** Health-check-only: confirms the bucket exists and is reachable. */
  async checkBucket(): Promise<void> {
    await this.internalClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  /** Direct server-side upload — used by import adapters (Step 9), not the presign-PUT flow. */
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.internalClient.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /**
   * Full object bytes, server-side — used by the transform pipeline (Step
   * 7) to pull an original in before resizing it; never exposed to a
   * client directly (that's what presigned GETs are for). Node's S3 SDK
   * returns `Body` as a `Readable`, not a `Buffer`, so this drains it.
   */
  async getObjectBytes(key: string): Promise<Buffer> {
    const result = await this.internalClient.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = result.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /** Returns null if the object doesn't exist — callers branch on that instead of catching. */
  async head(key: string): Promise<HeadResult | null> {
    try {
      const result = await this.internalClient.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: result.ContentLength ?? 0, contentType: result.ContentType };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.internalClient.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Bulk-deletes every object under a prefix (paginated — a real bucket
   * page can hold thousands of keys) — used to clear a file's whole
   * `derived/<id>/` tree in one call rather than the caller having to know
   * about individual derivative keys. A no-op today (nothing writes under
   * `derived/` until transforms exist), safe to call regardless.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listed = await this.internalClient.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (listed.Contents ?? [])
        .map((obj) => obj.Key)
        .filter((key): key is string => Boolean(key));
      if (keys.length > 0) {
        await this.internalClient.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })) },
          }),
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  /** Presigned PUT for the direct-upload flow (Step 5) — signed against the *public* client, see s3-clients.ts. */
  async putPresign(
    key: string,
    contentType: string,
    expirySeconds = DEFAULT_PRESIGN_EXPIRY_SECONDS,
  ): Promise<string> {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.publicClient, command, { expiresIn: expirySeconds });
  }

  /** Presigned GET for admin/library reads and public serving (Steps 6/8) — also the public client. */
  async getPresign(key: string, expirySeconds = DEFAULT_PRESIGN_EXPIRY_SECONDS): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.publicClient, command, { expiresIn: expirySeconds });
  }
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string } | undefined)?.name;
  const httpStatus = (err as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata
    ?.httpStatusCode;
  return name === 'NotFound' || name === 'NoSuchKey' || httpStatus === 404;
}
