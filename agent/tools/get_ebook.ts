import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { getEbookForOwner } from "@/lib/db/ebook-queries";
import { isDatabaseConfigured } from "@/lib/db/client";
import { ebookArtifactSchema, ebookSchema } from "#lib/ebook.js";
import { requireEbookOwnerKey } from "#lib/ebook-owner.js";

const outputSchema = z.object({
  ebookId: z.string(),
  revisionId: z.string(),
  revisionNumber: z.number().int().positive(),
  isCurrent: z.boolean(),
  changeSummary: z.string(),
  source: ebookSchema,
  artifact: ebookArtifactSchema,
  createdAt: z.string(),
  revisions: z.array(
    z.object({
      revisionId: z.string(),
      revisionNumber: z.number().int().positive(),
      changeSummary: z.string(),
      pageCount: z.number().int().positive(),
      pdfUrl: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export default defineTool({
  description:
    "Load the complete structured source, artifact metadata, and completed revision history for one of the current user's ebooks. Omit revisionId to load the current revision.",
  inputSchema: z.object({
    ebookId: z.string().min(1),
    revisionId: z.string().min(1).optional(),
  }),
  outputSchema,
  async execute(input, ctx) {
    if (!isDatabaseConfigured()) {
      throw new Error("Durable ebook revisions require the production database setup.");
    }

    const ownerKey = requireEbookOwnerKey(ctx.session.auth.current);
    const result = await getEbookForOwner({ ...input, ownerKey });

    if (!result?.artifact) {
      throw new Error("Ebook revision not found.");
    }

    return {
      ...result,
      source: ebookSchema.parse(result.source),
      artifact: ebookArtifactSchema.parse(result.artifact),
    };
  },
  toModelOutput(output) {
    return toolOutput.json(output);
  },
});
