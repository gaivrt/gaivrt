import type { Loader } from 'astro/loaders';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';
import matter from 'gray-matter';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface R2LoaderOptions {
  prefix: string;
}

interface RawFile {
  name: string;
  raw: string;
}

function toId(filename: string): string {
  return filename.replace(/\.md$/, '').toLowerCase().replace(/\s+/g, '-');
}

function isValidMd(name: string): boolean {
  const base = name.split('/').pop()!;
  return base.endsWith('.md') && !base.startsWith('_remotely-save-');
}

// ── R2 remote ────────────────────────────────────────

interface R2Env {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function createS3Client(env: R2Env): S3Client {
  const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
  return new S3Client({
    region: 'auto',
    endpoint: env.endpoint,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    ...(proxy && {
      requestHandler: new NodeHttpHandler({
        httpsAgent: new HttpsProxyAgent(proxy),
      }),
    }),
  });
}

async function fetchFromR2(
  prefix: string,
  env: R2Env,
): Promise<RawFile[]> {
  const client = createS3Client(env);
  const list = await client.send(
    new ListObjectsV2Command({ Bucket: env.bucket, Prefix: prefix }),
  );

  const files: RawFile[] = [];
  for (const obj of list.Contents ?? []) {
    if (!obj.Key || !isValidMd(obj.Key)) continue;
    const res = await client.send(
      new GetObjectCommand({ Bucket: env.bucket, Key: obj.Key }),
    );
    const raw = await res.Body!.transformToString('utf-8');
    files.push({ name: obj.Key.slice(prefix.length), raw });
  }
  return files;
}

// ── Local fallback ───────────────────────────────────

async function readLocal(
  collection: string,
  srcDir: URL,
): Promise<RawFile[]> {
  const dir = join(fileURLToPath(srcDir), 'content', collection);
  const entries = await readdir(dir);
  const files: RawFile[] = [];
  for (const entry of entries) {
    if (!isValidMd(entry)) continue;
    const raw = await readFile(join(dir, entry), 'utf-8');
    files.push({ name: entry, raw });
  }
  return files;
}

// ── Frontmatter normalization ────────────────────────

/** Extract title from first # heading in body */
function extractTitle(body: string, filename: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : filename.replace(/\.md$/, '');
}

/** Clean date strings like "2026-02-26-星期四" → "2026-02-26" */
function cleanDate(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const str = String(raw);
  const match = str.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : undefined;
}

function normalizeFrontmatter(
  fm: Record<string, unknown>,
  body: string,
  filename: string,
): Record<string, unknown> {
  return {
    ...fm,
    title: fm.title || extractTitle(body, filename),
    ...(fm.date !== undefined && { date: cleanDate(fm.date) ?? fm.date }),
  };
}

// ── Content normalization ────────────────────────────

/** Strip invisible chars that break markdown parsing (e.g. Obsidian/Typora artifacts) */
function normalizeMarkdown(raw: string): string {
  return raw
    // normalize line endings
    .replace(/\r\n?/g, '\n')
    // replace non-breaking spaces with regular spaces (breaks KaTeX etc.)
    .replace(/\u00A0/g, ' ')
    // remove zero-width spaces and other invisible chars from otherwise-blank lines
    .replace(/^[\u200B\u200C\u200D\uFEFF \t]+$/gm, '')
    // convert Typora-style single-$ display math to standard $$
    .replace(/^\$\s*$/gm, '$$$$');
}

// ── Loader ───────────────────────────────────────────

export function r2Loader({ prefix }: R2LoaderOptions): Loader {
  return {
    name: 'r2-loader',
    async load(ctx) {
      const {
        collection,
        store,
        logger,
        parseData,
        generateDigest,
        renderMarkdown,
        config,
      } = ctx;

      const env = import.meta.env;
      const r2Vals = {
        endpoint: env.R2_ENDPOINT,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
      };
      const hasR2 = Object.values(r2Vals).every(Boolean);

      if (!hasR2 && Object.values(r2Vals).some(Boolean)) {
        logger.warn('R2 环境变量不完整，回退到本地文件');
      }

      const files = hasR2
        ? await fetchFromR2(prefix, r2Vals as R2Env)
        : await readLocal(collection, config.srcDir);

      logger.info(
        `[${collection}] ${hasR2 ? 'R2' : '本地'}：${files.length} 个文件`,
      );

      store.clear();

      for (const file of files) {
        const { data: rawFm, content: rawBody } = matter(file.raw);
        const body = normalizeMarkdown(rawBody);
        const id = toId(file.name);
        const frontmatter = normalizeFrontmatter(rawFm, body, file.name);
        const digest = generateDigest(file.raw);
        const data = await parseData({ id, data: frontmatter });
        const rendered = await renderMarkdown(body);
        store.set({ id, data, body, rendered, digest });
      }
    },
  };
}
