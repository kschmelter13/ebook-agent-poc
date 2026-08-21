import { defineTool, toolOutput } from "eve/tools";
import { z } from "zod";
import { listEbooksForOwner } from "@/lib/db/ebook-queries";
import { isDatabaseConfigured } from "@/lib/db/client";
import { requireEbookOwnerKey } from "#lib/ebook-owner.js";

const ebookListItemSchema = z.object({
  ebookId: z.string(),
  revisionId: z.string(),
  revisionNumber: z.number().int().positive(),
  title: z.string(),
  pageCount: z.number().int().positive(),
  pdfUrl: z.string(),
  updatedAt: z.string(),
});

const outputSchema = z.object({ ebooks: z.array(ebookListItemSchema) });

export default defineTool({
  description:
    "List the current user's completed ebooks and their latest revision IDs. Use this when the user wants to edit an existing ebook but has not supplied an ebook ID.",
  inputSchema: z.object({}),
  outputSchema,
  async execute(_input, ctx) {
    if (!isDatabaseConfigured()) {
      throw new Error("Durable ebook revisions require the production database setup.");
    }

    const ownerKey = requireEbookOwnerKey(ctx.session.auth.current);
    return { ebooks: await listEbooksForOwner(ownerKey) };
  },
  toModelOutput(output) {
    return toolOutput.json(output);
  },
});
