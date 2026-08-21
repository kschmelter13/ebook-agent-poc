import { defineTool, toolOutput } from "eve/tools";
import { always } from "eve/tools/approval";
import {
  beginNewEbook,
  completeEbookRevision,
  failEbookRevision,
} from "@/lib/db/ebook-queries";
import { isDatabaseConfigured } from "@/lib/db/client";
import { buildEbookArtifact } from "#lib/ebook-artifact.js";
import { ebookArtifactSchema, ebookSchema, hashEbook } from "#lib/ebook.js";
import { ebookOperationId, requireEbookOwnerKey } from "#lib/ebook-owner.js";

export { buildEbookArtifact } from "#lib/ebook-artifact.js";

export default defineTool({
  description:
    "Create a new ebook after presenting its approved title and outline. The tool requests final approval, generates the cover, renders a 10–50 page PDF, and saves revision 1 plus editable JSON source.",
  inputSchema: ebookSchema,
  outputSchema: ebookArtifactSchema,
  approval: always(),
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

    if (!isDatabaseConfigured()) {
      yield await buildEbookArtifact(book, { abortSignal: ctx.abortSignal });
      return;
    }

    const ownerKey = requireEbookOwnerKey(ctx.session.auth.current);
    const ebookId = ebookOperationId("ebook", ownerKey, ctx.callId);
    const revisionId = ebookOperationId("revision", ownerKey, ctx.callId);
    const pending = await beginNewEbook({
      ebookId,
      ownerKey,
      revisionId,
      source: ebookSchema.parse(book),
      contentHash: hashEbook(book),
    });

    if (pending.artifact) {
      yield pending.artifact;
      return;
    }

    try {
      const artifact = await buildEbookArtifact(book, {
        abortSignal: ctx.abortSignal,
        artifactId: revisionId,
        blobPrefix: `ebooks/${ebookId}/revisions/${revisionId}`,
      });
      yield await completeEbookRevision({ ownerKey, revisionId, artifact });
    } catch (error) {
      await failEbookRevision(ownerKey, revisionId, error);
      throw error;
    }
  },
  toModelOutput(output) {
    const revision = output.revisionNumber ? ` revision ${output.revisionNumber}` : "";
    return toolOutput.text(
      `Created “${output.title}”${revision} as a ${output.pageCount}-page PDF. Download: ${output.pdfUrl}`,
    );
  },
});
