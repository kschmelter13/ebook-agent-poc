import { defineTool, toolOutput } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import {
  beginEbookRevision,
  completeEbookRevision,
  failEbookRevision,
} from "@/lib/db/ebook-queries";
import { isDatabaseConfigured } from "@/lib/db/client";
import { buildEbookArtifact } from "#lib/ebook-artifact.js";
import { ebookArtifactSchema, ebookSchema, hashEbook } from "#lib/ebook.js";
import { ebookOperationId, requireEbookOwnerKey } from "#lib/ebook-owner.js";

const inputSchema = z.object({
  ebookId: z.string().min(1),
  baseRevisionId: z.string().min(1),
  changeSummary: z.string().min(10).max(1000),
  coverPolicy: z.enum(["reuse", "regenerate", "designed"]).default("reuse"),
  ebook: ebookSchema,
});

export default defineTool({
  description:
    "Create an immutable new revision of an existing ebook after showing the user a concise change summary. The tool requests final approval, rejects stale bases, preserves all earlier revisions, and reuses the prior cover unless coverPolicy says otherwise.",
  inputSchema,
  outputSchema: ebookArtifactSchema,
  approval: always(),
  async *execute(input, ctx) {
    if (!isDatabaseConfigured()) {
      throw new Error("Durable ebook revisions require the production database setup.");
    }

    yield {
      artifactId: "pending",
      ebookId: input.ebookId,
      revisionId: "pending",
      title: input.ebook.title,
      pageCount: 0,
      pdfUrl: "",
      sourceUrl: "",
      coverSource: "designed" as const,
      storage: "local" as const,
      createdAt: new Date().toISOString(),
    };

    const ownerKey = requireEbookOwnerKey(ctx.session.auth.current);
    const revisionId = ebookOperationId("revision", ownerKey, ctx.callId);
    const pending = await beginEbookRevision({
      ebookId: input.ebookId,
      ownerKey,
      revisionId,
      baseRevisionId: input.baseRevisionId,
      source: input.ebook,
      contentHash: hashEbook(input.ebook),
      changeSummary: input.changeSummary,
    });

    if (pending.artifact) {
      yield pending.artifact;
      return;
    }

    const cover =
      input.coverPolicy === "reuse"
        ? { mode: "reuse" as const, url: pending.previousCoverUrl }
        : input.coverPolicy === "regenerate"
          ? { mode: "generate" as const }
          : { mode: "designed" as const };

    try {
      const artifact = await buildEbookArtifact(input.ebook, {
        abortSignal: ctx.abortSignal,
        artifactId: revisionId,
        blobPrefix: `ebooks/${input.ebookId}/revisions/${revisionId}`,
        cover,
      });
      yield await completeEbookRevision({ ownerKey, revisionId, artifact });
    } catch (error) {
      await failEbookRevision(ownerKey, revisionId, error);
      throw error;
    }
  },
  toModelOutput(output) {
    return toolOutput.text(
      `Created revision ${output.revisionNumber} of “${output.title}” as a ${output.pageCount}-page PDF. Download: ${output.pdfUrl}`,
    );
  },
});
