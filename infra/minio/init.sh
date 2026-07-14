#!/bin/sh
# One-shot bucket + CORS provisioning for the `minio` service, run by the
# `minio-init` container on every `docker compose up` (mounted into
# minio/mc, not minio/minio — the mc CLI isn't in the server image).
#
# CORS is set via `mc admin config set ... api cors_allow_origin=...`, a
# server-wide setting — NOT `mc cors set` (the S3 PutBucketCors API), which
# this MinIO release (RELEASE.2025-09-07) returns a hard `NotImplemented`
# for on every call ("A header you provided implies functionality that is
# not implemented"), confirmed by hand against the real container before
# writing this script. `cors_allow_origin` defaults to `*` out of the box,
# so this narrows it to the actual dev origins rather than leaving it wide
# open. Hot-reloads with no restart needed — verified with a real OPTIONS
# preflight against the running container.
#
# `mc mb --ignore-existing` and `mc admin config set` are both idempotent,
# so re-running against an already-provisioned bucket is a no-op.
set -e

mc alias set local "http://minio:9000" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mb --ignore-existing "local/$MEDIA_S3_BUCKET"
mc admin config set local api cors_allow_origin="$MEDIA_S3_CORS_ORIGINS"

echo "[minio-init] bucket '$MEDIA_S3_BUCKET' ready, CORS origins: $MEDIA_S3_CORS_ORIGINS"
