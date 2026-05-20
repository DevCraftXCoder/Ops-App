/**
 * cf-blob.ts — R2-backed blob storage for the Ops App.
 *
 * Provides put / list / del / head / get / getJSON.
 * Requires the BLOB_BUCKET R2 binding in wrangler.jsonc.
 * Only works at request time on CF Workers (not during next build).
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BlobItem {
  key: string;
  pathname: string;
  url: string;
  size: number;
  uploadedAt: string;
  downloadUrl: string;
}

export interface ListResult {
  blobs: BlobItem[];
}

// ── Internals ────────────────────────────────────────────────────────────────

async function getBucket(): Promise<R2Bucket> {
  const { env } = await getCloudflareContext();
  return (env as Record<string, unknown>).BLOB_BUCKET as R2Bucket;
}

function toItem(obj: R2Object): BlobItem {
  return {
    key: obj.key,
    pathname: obj.key,
    url: obj.key,
    size: obj.size,
    uploadedAt: obj.uploaded.toISOString(),
    downloadUrl: obj.key,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function list(
  opts: { prefix?: string; limit?: number } = {},
): Promise<ListResult> {
  const bucket = await getBucket();
  const listed = await bucket.list({
    prefix: opts.prefix,
    limit: opts.limit,
  });
  return { blobs: listed.objects.map(toItem) };
}

export async function put(
  key: string,
  content: string | ArrayBuffer | ReadableStream,
  _opts?: { contentType?: string },
): Promise<{ url: string; pathname: string }> {
  const bucket = await getBucket();
  if (_opts?.contentType) {
    await (bucket as unknown as { put(k: string, v: typeof content, o: Record<string, unknown>): Promise<R2Object> })
      .put(key, content, { httpMetadata: { contentType: _opts.contentType } });
  } else {
    await bucket.put(key, content);
  }
  return { url: key, pathname: key };
}

export async function del(key: string | string[]): Promise<void> {
  const bucket = await getBucket();
  const keys = Array.isArray(key) ? key : [key];
  await Promise.all(keys.map((k) => bucket.delete(k)));
}

export async function get(key: string): Promise<string | null> {
  const bucket = await getBucket();
  const obj = await bucket.get(key);
  if (!obj) return null;
  return obj.text();
}

export async function getJSON<T = unknown>(key: string): Promise<T | null> {
  const text = await get(key);
  if (text === null) return null;
  return JSON.parse(text) as T;
}

export async function head(
  key: string,
): Promise<{ size: number; uploadedAt: string } | null> {
  const bucket = await getBucket();
  const obj = await bucket.head(key);
  if (!obj) return null;
  return { size: obj.size, uploadedAt: obj.uploaded.toISOString() };
}
