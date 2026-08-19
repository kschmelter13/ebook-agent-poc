import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import { generateImage, gateway } from "ai";
import { defineTool, toolOutput } from "eve/tools";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { EbookDocument } from "@/lib/ebook-document";
import { ebookSchema, slugify, type Ebook } from "#lib/ebook.js";

const artifactSchema = z.object({
  artifactId: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  pageCount: z.number().int(),
  pdfUrl: z.string(),
  sourceUrl: z.string(),
  coverUrl: z.string().optional(),
  coverSource: z.enum(["ai", "designed"]),
  storage: z.enum(["vercel-blob", "local"]),
  createdAt: z.string(),
});

type Artifact = z.infer<typeof artifactSchema>;

async function generateCover(book: Ebook, abortSignal?: AbortSignal) {
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

    return {
      bytes: Buffer.from(image.uint8Array),
      dataUrl: `data:${image.mediaType};base64,${image.base64}`,
      mediaType: image.mediaType,
    };
  } catch (error) {
    console.warn("Cover generation unavailable; using the designed vector cover.", error);
    return null;
  }
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
  book,
  cover,
  pdfBuffer,
}: {
  readonly artifactId: string;
  readonly book: Ebook;
  readonly cover: Awaited<ReturnType<typeof generateCover>>;
  readonly pdfBuffer: Buffer;
}): Promise<Artifact> {
  const slug = slugify(book.title);
  const prefix = `ebooks/${artifactId}`;
  const createdAt = new Date().toISOString();
  const source = JSON.stringify({ ...book, artifactId, createdAt }, null, 2);
  const uploads = [
    put(`${prefix}/${slug}.pdf`, pdfBuffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/pdf",
    }),
    put(`${prefix}/${slug}.json`, source, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    }),
    cover
      ? put(`${prefix}/cover.${cover.mediaType === "image/jpeg" ? "jpg" : "png"}`, cover.bytes, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: cover.mediaType,
        })
      : Promise.resolve(null),
  ] as const;
  const [pdfBlob, sourceBlob, coverBlob] = await Promise.all(uploads);

  return {
    artifactId,
    title: book.title,
    subtitle: book.subtitle,
    pageCount: (await PDFDocument.load(pdfBuffer)).getPageCount(),
    pdfUrl: pdfBlob.downloadUrl,
    sourceUrl: sourceBlob.downloadUrl,
    coverUrl: coverBlob?.url,
    coverSource: cover ? "ai" : "designed",
    storage: "vercel-blob",
    createdAt,
  };
}

async function saveLocally({
  artifactId,
  book,
  cover,
  pageCount,
  pdfBuffer,
}: {
  readonly artifactId: string;
  readonly book: Ebook;
  readonly cover: Awaited<ReturnType<typeof generateCover>>;
  readonly pageCount: number;
  readonly pdfBuffer: Buffer;
}): Promise<Artifact> {
  const directory = path.join(process.cwd(), ".local-artifacts", artifactId);
  const createdAt = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(path.join(directory, "ebook.pdf"), pdfBuffer),
    writeFile(
      path.join(directory, "source.json"),
      JSON.stringify({ ...book, artifactId, createdAt }, null, 2),
    ),
    cover ? writeFile(path.join(directory, "cover.png"), cover.bytes) : Promise.resolve(),
  ]);

  const base = `/api/artifacts/${artifactId}`;
  return {
    artifactId,
    title: book.title,
    subtitle: book.subtitle,
    pageCount,
    pdfUrl: `${base}/ebook.pdf`,
    sourceUrl: `${base}/source.json`,
    coverUrl: cover ? `${base}/cover.png` : undefined,
    coverSource: cover ? "ai" : "designed",
    storage: "local",
    createdAt,
  };
}

export async function buildEbookArtifact(book: Ebook, abortSignal?: AbortSignal) {
  const normalized = ebookSchema.parse(book);
  const artifactId = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex")
    .slice(0, 16);
  const cover = await generateCover(normalized, abortSignal);
  const { pageCount, pdfBuffer } = await renderEbook(normalized, cover?.dataUrl);

  try {
    return await saveToBlob({ artifactId, book: normalized, cover, pdfBuffer });
  } catch (error) {
    if (process.env.VERCEL) {
      throw error;
    }

    console.warn("Blob storage unavailable locally; saving to .local-artifacts.", error);
    return saveLocally({ artifactId, book: normalized, cover, pageCount, pdfBuffer });
  }
}

export default defineTool({
  description:
    "Generate the approved ebook cover, render a polished PDF, validate its page count, and save the PDF plus editable JSON source. Call this exactly once after the user explicitly approves the title and outline.",
  inputSchema: ebookSchema,
  outputSchema: artifactSchema,
  async *execute(book, ctx) {
    yield {
      artifactId: "pending",
      title: book.title,
      pageCount: 0,
      pdfUrl: "",
      sourceUrl: "",
      coverSource: "designed" as const,
      storage: "local" as const,
      createdAt: new Date().toISOString(),
    };
    yield await buildEbookArtifact(book, ctx.abortSignal);
  },
  toModelOutput(output) {
    return toolOutput.text(
      `Created “${output.title}” as a ${output.pageCount}-page PDF. Download: ${output.pdfUrl}`,
    );
  },
});
