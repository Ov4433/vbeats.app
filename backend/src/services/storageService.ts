import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Durable audio storage on Cloudflare R2 (S3-compatible).
//
// Why: Render's local disk is ephemeral — every redeploy wiped /uploads and
// live beats went silent (404). Files in R2 persist, and beats store the
// public URL directly, so playback never depends on this server's disk.
//
// When the R2 env vars are not all set, uploads fall back to the local disk
// exactly as before (local dev). Production must set all five.
// ---------------------------------------------------------------------------

export function r2Configured(): boolean {
  return Boolean(
    config.r2AccountId &&
      config.r2AccessKeyId &&
      config.r2SecretAccessKey &&
      config.r2Bucket &&
      config.r2PublicBaseUrl
  );
}

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2AccessKeyId,
        secretAccessKey: config.r2SecretAccessKey,
      },
    });
  }
  return client;
}

/**
 * Upload a local file to R2 under beats/<generated name> and return its
 * public URL. Throws on failure — a failed durable write must fail the
 * upload rather than silently storing a file that will disappear.
 */
export async function storeAudioFile(
  localPath: string,
  originalName: string,
  contentType: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase() || '.bin';
  const key = `beats/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const body = await fs.promises.readFile(localPath);
  await getClient().send(
    new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  return `${config.r2PublicBaseUrl}/${key}`;
}

/** Extract the R2 object key from a stored public URL, or null. */
export function r2KeyForUrl(url: string | null): string | null {
  if (!url || !config.r2PublicBaseUrl) return null;
  const prefix = `${config.r2PublicBaseUrl}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : null;
}

/** Best-effort delete of an R2 object by key. */
export async function deleteAudioObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: config.r2Bucket, Key: key })
  );
}
