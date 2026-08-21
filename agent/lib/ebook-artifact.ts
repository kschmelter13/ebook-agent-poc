import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import { generateImage, gateway } from "ai";
import { PDFDocument } from "pdf-lib";
import { EbookDocument } from "@/lib/ebook-document";
import {
  ebookSchema,
  hashEbook,
  slugify,
  type Ebook,
  type EbookArtifact,
} from "#lib/ebook.js";

type CoverAsset = {
  readonly bytes: Buffer;
  readonly dataUrl: string;
  readonly mediaType: "image/jpeg" | "image/png";
};

export type BuildArtifactOptions = {
  readonly abortSignal?: AbortSignal;
  readonly artifactId?: string;
  readonly blobPrefix?: string;
  readonly cover?:
    | { readonly mode: "designed" }
    | { readonly mode: "generate" }
    | { readonly mode: "reuse"; readonly url?: string };
};

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function coverExtension(mediaType: CoverAsset["mediaType"]) {
  return mediaType === "image/jpeg" ? "jpg" : "png";
}

function toCoverAsset(bytes: Buffer, mediaType: CoverAsset["mediaType"]): CoverAsset {
  return {
    bytes,
    dataUrl: `data:${mediaType};base64,${bytes.toString("base64")}`,
    mediaType,
  };
}

async function generateCover(book: Ebook, abortSignal?: AbortSignal): Promise<CoverAsset | null> {
  try {
    const { image } = await generateImage({
      model: gateway.image("openai/gpt-image-2"),
      prompt: [
        `Create a premium ${book.coverStyle} book-cover image for a concise practical guide.`,
        book.coverPrompt,
        "Portrait composition, strong focal point, sophisticated editorial lighting.",
        "Do not include words, letters, typography, logos, borders, or watermarks.",
      ].join(" "),
      size: "1024x1536",
      abortSignal,
    });
    const mediaType = image.mediaType === "image/jpeg" ? "image/jpeg" : "image/png";

    return toCoverAsset(Buffer.from(image.uint8Array), mediaType);
  } catch (error) {
    if (isAbortError(error) || abortSignal?.aborted) {
      throw error;
    }

    console.warn("Cover generation unavailable; using the designed vector cover.", error);
    return null;
  }
}

async function loadExistingCover(url: string, abortSignal?: AbortSignal): Promise<CoverAsset> {
  const localMatch = url.match(/^\/api\/artifacts\/([a-f0-9]{16,32})\/(cover\.(?:png|jpg))$/);

  if (localMatch) {
    const [, artifactId, filename] = localMatch;
    const bytes = await readFile(path.join(process.cwd(), ".local-artifacts", artifactId!, filename!));
    return toCoverAsset(bytes, filename!.endsWith(".jpg") ? "image/jpeg" : "image/png");
  }

  const parsed = new URL(url);

  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new Error("The previous cover URL is not a trusted ebook artifact.");
  }

  const response = await fetch(parsed, { signal: abortSignal });

  if (!response.ok) {
    throw new Error(`Failed to load the previous cover (${response.status}).`);
  }

  const contentType = response.headers.get("content-type")?.split(";", 1)[0];

  if (contentType !== "image/png" && contentType !== "image/jpeg") {
    throw new Error("The previous cover is not a supported PNG or JPEG image.");
  }

  return toCoverAsset(Buffer.from(await response.arrayBuffer()), contentType);
}

async function resolveCover(book: Ebook, options: BuildArtifactOptions) {
  const cover = options.cover ?? { mode: "generate" as const };

  if (cover.mode === "designed") {
    return { asset: null, source: "designed" as const };
  }

  if (cover.mode === "reuse") {
    return cover.url
      ? { asset: await loadExistingCover(cover.url, options.abortSignal), source: "reused" as const }
      : { asset: null, source: "designed" as const };
  }

  const generated = await generateCover(book, options.abortSignal);
  return generated
    ? { asset: generated, source: "ai" as const }
    : { asset: null, source: "designed" as const };
}

async function renderEbook(book: Ebook, coverDataUrl?: string) {
  const pdfBuffer = await renderToBuffer(EbookDocument({ book, coverDataUrl }));
  const parsed = await PDFDocument.load(pdfBuffer);
  const pageCount = parsed.getPageCount();

  if (pageCount < 10 || pageCount > 50) {
    throw new Error(
      `The rendered ebook is ${pageCount} pages. Revise the content so the final PDF is between 10 and 50 pages.`,
    );
  }

  return { pageCount, pdfBuffer };
}

async function saveToBlob({
  artifactId,
  blobPrefix,
  book,
  cover,
  coverSource,
  pageCount,
  pdfBuffer,
  abortSignal,
}: {
  readonly artifactId: string;
  readonly blobPrefix: string;
  readonly book: Ebook;
  readonly cover: CoverAsset | null;
  readonly coverSource: EbookArtifact["coverSource"];
  readonly pageCount: number;
  readonly pdfBuffer: Buffer;
  readonly abortSignal?: AbortSignal;
}): Promise<EbookArtifact> {
  const slug = slugify(book.title);
  const createdAt = new Date().toISOString();
  const source = JSON.stringify({ ...book, artifactId, createdAt }, null, 2);
  const uploads = [
    put(`${blobPrefix}/${slug}.pdf`, pdfBuffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/pdf",
      abortSignal,
    }),
    put(`${blobPrefix}/${slug}.json`, source, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      abortSignal,
    }),
    cover
      ? put(`${blobPrefix}/cover.${coverExtension(cover.mediaType)}`, cover.bytes, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: cover.mediaType,
          abortSignal,
        })
      : Promise.resolve(null),
  ] as const;
  const [pdfBlob, sourceBlob, coverBlob] = await Promise.all(uploads);

  return {
    artifactId,
    title: book.title,
    subtitle: book.subtitle,
    pageCount,
    pdfUrl: pdfBlob.downloadUrl,
    sourceUrl: sourceBlob.downloadUrl,
    coverUrl: coverBlob?.url,
    coverSource,
    storage: "vercel-blob",
    createdAt,
  };
}

async function saveLocally({
  artifactId,
  book,
  cover,
  coverSource,
  pageCount,
  pdfBuffer,
}: {
  readonly artifactId: string;
  readonly book: Ebook;
  readonly cover: CoverAsset | null;
  readonly coverSource: EbookArtifact["coverSource"];
  readonly pageCount: number;
  readonly pdfBuffer: Buffer;
}): Promise<EbookArtifact> {
  const directory = path.join(process.cwd(), ".local-artifacts", artifactId);
  const createdAt = new Date().toISOString();
  const coverFilename = cover ? `cover.${coverExtension(cover.mediaType)}` : undefined;
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "ebook.pdf"), pdfBuffer),
    writeFile(
      path.join(directory, "source.json"),
      JSON.stringify({ ...book, artifactId, createdAt }, null, 2),
    ),
    cover && coverFilename
      ? writeFile(path.join(directory, coverFilename), cover.bytes)
      : Promise.resolve(),
  ]);

  const base = `/api/artifacts/${artifactId}`;
  return {
    artifactId,
    title: book.title,
    subtitle: book.subtitle,
    pageCount,
    pdfUrl: `${base}/ebook.pdf`,
    sourceUrl: `${base}/source.json`,
    coverUrl: coverFilename ? `${base}/${coverFilename}` : undefined,
    coverSource,
    storage: "local",
    createdAt,
  };
}

export async function buildEbookArtifact(book: Ebook, options: BuildArtifactOptions = {}) {
  const normalized = ebookSchema.parse(book);
  const artifactId = options.artifactId ?? hashEbook(normalized).slice(0, 16);
  const blobPrefix = options.blobPrefix ?? `ebooks/${artifactId}`;
  const cover = await resolveCover(normalized, options);
  const { pageCount, pdfBuffer } = await renderEbook(normalized, cover.asset?.dataUrl);

  try {
    return await saveToBlob({
      artifactId,
      blobPrefix,
      book: normalized,
      cover: cover.asset,
      coverSource: cover.source,
      pageCount,
      pdfBuffer,
      abortSignal: options.abortSignal,
    });
  } catch (error) {
    if (isAbortError(error) || options.abortSignal?.aborted || process.env.VERCEL) {
      throw error;
    }

    console.warn("Blob storage unavailable locally; saving to .local-artifacts.", error);
    return saveLocally({
      artifactId,
      book: normalized,
      cover: cover.asset,
      coverSource: cover.source,
      pageCount,
      pdfBuffer,
    });
  }
}
