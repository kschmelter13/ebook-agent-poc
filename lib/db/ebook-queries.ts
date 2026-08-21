import { and, desc, eq, exists, isNull, max, sql } from "drizzle-orm";
import type { Ebook, EbookArtifact } from "@/agent/lib/ebook";
import { getDb } from "@/lib/db/client";
import { ebook, ebookRevision } from "@/lib/db/schema";

type PendingRevision = {
  readonly ebookId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly status: "pending" | "complete";
  readonly artifact?: EbookArtifact;
  readonly previousCoverUrl?: string;
};

function artifactFromRow(row: typeof ebookRevision.$inferSelect): EbookArtifact | undefined {
  if (
    row.status !== "complete" ||
    row.pageCount === null ||
    !row.pdfUrl ||
    !row.sourceUrl ||
    !row.coverSource ||
    !row.storage ||
    !row.completedAt
  ) {
    return undefined;
  }

  return {
    artifactId: row.id,
    ebookId: row.ebookId,
    revisionId: row.id,
    revisionNumber: row.revisionNumber,
    title: row.source.title,
    subtitle: row.source.subtitle,
    pageCount: row.pageCount,
    pdfUrl: row.pdfUrl,
    sourceUrl: row.sourceUrl,
    coverUrl: row.coverUrl ?? undefined,
    coverSource: row.coverSource,
    storage: row.storage,
    createdAt: row.completedAt.toISOString(),
  };
}

export async function listEbooksForOwner(ownerKey: string) {
  const db = getDb();
  const rows = await db
    .select({
      ebookId: ebook.id,
      revisionId: ebookRevision.id,
      revisionNumber: ebookRevision.revisionNumber,
      title: ebook.title,
      pageCount: ebookRevision.pageCount,
      pdfUrl: ebookRevision.pdfUrl,
      updatedAt: ebook.updatedAt,
    })
    .from(ebook)
    .innerJoin(ebookRevision, eq(ebookRevision.id, ebook.currentRevisionId))
    .where(and(eq(ebook.ownerKey, ownerKey), eq(ebookRevision.status, "complete")))
    .orderBy(desc(ebook.updatedAt));

  return rows.map((row) => ({
    ebookId: row.ebookId,
    revisionId: row.revisionId,
    revisionNumber: row.revisionNumber,
    title: row.title,
    pageCount: row.pageCount ?? 0,
    pdfUrl: row.pdfUrl ?? "",
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function getEbookForOwner({
  ebookId,
  ownerKey,
  revisionId,
}: {
  readonly ebookId: string;
  readonly ownerKey: string;
  readonly revisionId?: string;
}) {
  const db = getDb();
  const rows = await db
    .select({ book: ebook, revision: ebookRevision })
    .from(ebook)
    .innerJoin(
      ebookRevision,
      revisionId ? eq(ebookRevision.id, revisionId) : eq(ebookRevision.id, ebook.currentRevisionId),
    )
    .where(
      and(
        eq(ebook.id, ebookId),
        eq(ebook.ownerKey, ownerKey),
        eq(ebookRevision.ebookId, ebookId),
        eq(ebookRevision.status, "complete"),
      ),
    )
    .limit(1);
  const row = rows[0];

  if (!row) {
    return null;
  }

  const revisions = await db
    .select({
      revisionId: ebookRevision.id,
      revisionNumber: ebookRevision.revisionNumber,
      changeSummary: ebookRevision.changeSummary,
      pageCount: ebookRevision.pageCount,
      pdfUrl: ebookRevision.pdfUrl,
      createdAt: ebookRevision.completedAt,
    })
    .from(ebookRevision)
    .where(and(eq(ebookRevision.ebookId, ebookId), eq(ebookRevision.status, "complete")))
    .orderBy(desc(ebookRevision.revisionNumber));

  return {
    ebookId: row.book.id,
    isCurrent: row.book.currentRevisionId === row.revision.id,
    revisionId: row.revision.id,
    revisionNumber: row.revision.revisionNumber,
    changeSummary: row.revision.changeSummary,
    source: row.revision.source,
    artifact: artifactFromRow(row.revision),
    createdAt: row.revision.createdAt.toISOString(),
    revisions: revisions.map((revision) => ({
      revisionId: revision.revisionId,
      revisionNumber: revision.revisionNumber,
      changeSummary: revision.changeSummary,
      pageCount: revision.pageCount ?? 0,
      pdfUrl: revision.pdfUrl ?? "",
      createdAt: revision.createdAt?.toISOString() ?? "",
    })),
  };
}

export async function beginNewEbook({
  ebookId,
  ownerKey,
  revisionId,
  source,
  contentHash,
}: {
  readonly ebookId: string;
  readonly ownerKey: string;
  readonly revisionId: string;
  readonly source: Ebook;
  readonly contentHash: string;
}): Promise<PendingRevision> {
  const db = getDb();
  await db
    .insert(ebook)
    .values({ id: ebookId, ownerKey, title: source.title })
    .onConflictDoNothing({ target: ebook.id });

  const [ownedBook] = await db
    .select({ id: ebook.id, ownerKey: ebook.ownerKey })
    .from(ebook)
    .where(eq(ebook.id, ebookId))
    .limit(1);

  if (!ownedBook || ownedBook.ownerKey !== ownerKey) {
    throw new Error("Ebook operation does not belong to the current user.");
  }

  await db
    .insert(ebookRevision)
    .values({
      id: revisionId,
      ebookId,
      revisionNumber: 1,
      source,
      contentHash,
      changeSummary: "Initial edition",
    })
    .onConflictDoNothing({ target: ebookRevision.id });

  const [revision] = await db
    .select()
    .from(ebookRevision)
    .where(eq(ebookRevision.id, revisionId))
    .limit(1);

  if (!revision || revision.ebookId !== ebookId || revision.contentHash !== contentHash) {
    throw new Error("Ebook operation conflicts with an existing revision.");
  }

  if (revision.status === "failed") {
    throw new Error(revision.errorMessage ?? "The ebook build previously failed.");
  }

  return {
    ebookId,
    revisionId,
    revisionNumber: revision.revisionNumber,
    status: revision.status,
    artifact: artifactFromRow(revision),
  };
}

export async function beginEbookRevision({
  ebookId,
  ownerKey,
  revisionId,
  baseRevisionId,
  source,
  contentHash,
  changeSummary,
}: {
  readonly ebookId: string;
  readonly ownerKey: string;
  readonly revisionId: string;
  readonly baseRevisionId: string;
  readonly source: Ebook;
  readonly contentHash: string;
  readonly changeSummary: string;
}): Promise<PendingRevision> {
  const db = getDb();
  const [existing] = await db
    .select({ bookOwnerKey: ebook.ownerKey, revision: ebookRevision })
    .from(ebookRevision)
    .innerJoin(ebook, eq(ebook.id, ebookRevision.ebookId))
    .where(eq(ebookRevision.id, revisionId))
    .limit(1);

  if (existing) {
    if (
      existing.bookOwnerKey !== ownerKey ||
      existing.revision.ebookId !== ebookId ||
      existing.revision.parentRevisionId !== baseRevisionId ||
      existing.revision.contentHash !== contentHash
    ) {
      throw new Error("Ebook operation conflicts with an existing revision.");
    }

    if (existing.revision.status === "failed") {
      throw new Error(existing.revision.errorMessage ?? "The ebook revision previously failed.");
    }

    const [parent] = existing.revision.parentRevisionId
      ? await db
          .select({ coverUrl: ebookRevision.coverUrl })
          .from(ebookRevision)
          .where(
            and(
              eq(ebookRevision.id, existing.revision.parentRevisionId),
              eq(ebookRevision.ebookId, ebookId),
              eq(ebookRevision.status, "complete"),
            ),
          )
          .limit(1)
      : [];

    return {
      ebookId,
      revisionId,
      revisionNumber: existing.revision.revisionNumber,
      status: existing.revision.status,
      artifact: artifactFromRow(existing.revision),
      previousCoverUrl: parent?.coverUrl ?? undefined,
    };
  }

  const [book] = await db
    .select({ currentRevisionId: ebook.currentRevisionId })
    .from(ebook)
    .where(and(eq(ebook.id, ebookId), eq(ebook.ownerKey, ownerKey)))
    .limit(1);

  if (!book) {
    throw new Error("Ebook not found.");
  }

  if (book.currentRevisionId !== baseRevisionId) {
    throw new Error("This ebook changed after it was loaded. Load the latest revision and retry.");
  }

  const [baseRevision] = await db
    .select({ coverUrl: ebookRevision.coverUrl, contentHash: ebookRevision.contentHash })
    .from(ebookRevision)
    .where(
      and(
        eq(ebookRevision.id, baseRevisionId),
        eq(ebookRevision.ebookId, ebookId),
        eq(ebookRevision.status, "complete"),
      ),
    )
    .limit(1);

  if (!baseRevision) {
    throw new Error("Base revision not found.");
  }

  if (baseRevision.contentHash === contentHash) {
    throw new Error("The proposed revision does not change the ebook source.");
  }

  const [numberRow] = await db
    .select({ value: max(ebookRevision.revisionNumber) })
    .from(ebookRevision)
    .where(eq(ebookRevision.ebookId, ebookId));
  const revisionNumber = (numberRow?.value ?? 0) + 1;

  await db.insert(ebookRevision).values({
    id: revisionId,
    ebookId,
    parentRevisionId: baseRevisionId,
    revisionNumber,
    source,
    contentHash,
    changeSummary,
  });

  return {
    ebookId,
    revisionId,
    revisionNumber,
    status: "pending",
    previousCoverUrl: baseRevision.coverUrl ?? undefined,
  };
}

export async function completeEbookRevision({
  ownerKey,
  revisionId,
  artifact,
}: {
  readonly ownerKey: string;
  readonly revisionId: string;
  readonly artifact: EbookArtifact;
}) {
  if (artifact.artifactId !== revisionId) {
    throw new Error("The rendered artifact does not match the pending revision.");
  }

  const db = getDb();
  const [row] = await db
    .select({ book: ebook, revision: ebookRevision })
    .from(ebookRevision)
    .innerJoin(ebook, eq(ebook.id, ebookRevision.ebookId))
    .where(and(eq(ebookRevision.id, revisionId), eq(ebook.ownerKey, ownerKey)))
    .limit(1);

  if (!row) {
    throw new Error("Ebook revision not found.");
  }

  const expectedCurrent = row.revision.parentRevisionId;
  const completedAt = new Date();
  const pendingRevisionExists = exists(
    db
      .select({ value: sql`1` })
      .from(ebookRevision)
      .where(
        and(
          eq(ebookRevision.id, revisionId),
          eq(ebookRevision.ebookId, row.book.id),
          eq(ebookRevision.status, "pending"),
        ),
      ),
  );
  const revisionBecameCurrent = exists(
    db
      .select({ value: sql`1` })
      .from(ebook)
      .where(
        and(
          eq(ebook.id, row.book.id),
          eq(ebook.ownerKey, ownerKey),
          eq(ebook.currentRevisionId, revisionId),
        ),
      ),
  );
  const [advancedRows, completedRows] = await db.batch([
    db
      .update(ebook)
      .set({
        currentRevisionId: revisionId,
        title: row.revision.source.title,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(ebook.id, row.book.id),
          eq(ebook.ownerKey, ownerKey),
          pendingRevisionExists,
          expectedCurrent ? eq(ebook.currentRevisionId, expectedCurrent) : isNull(ebook.currentRevisionId),
        ),
      )
      .returning({ id: ebook.id }),
    db
      .update(ebookRevision)
      .set({
        status: "complete",
        pageCount: artifact.pageCount,
        pdfUrl: artifact.pdfUrl,
        sourceUrl: artifact.sourceUrl,
        coverUrl: artifact.coverUrl ?? null,
        coverSource: artifact.coverSource,
        storage: artifact.storage,
        errorMessage: null,
        completedAt,
      })
      .where(
        and(
          eq(ebookRevision.id, revisionId),
          eq(ebookRevision.status, "pending"),
          revisionBecameCurrent,
        ),
      )
      .returning(),
  ]);
  const advanced = advancedRows[0];
  const completed = completedRows[0];

  if (!advanced || !completed) {
    throw new Error("This ebook changed while the revision was rendering. Reload and retry.");
  }

  return {
    ...artifact,
    ebookId: row.book.id,
    revisionId,
    revisionNumber: completed.revisionNumber,
    createdAt: completedAt.toISOString(),
  } satisfies EbookArtifact;
}

export async function failEbookRevision(ownerKey: string, revisionId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Ebook rendering failed.";
  const db = getDb();
  const ownedBookExists = exists(
    db
      .select({ value: sql`1` })
      .from(ebook)
      .where(and(eq(ebook.id, ebookRevision.ebookId), eq(ebook.ownerKey, ownerKey))),
  );
  await db
    .update(ebookRevision)
    .set({ status: "failed", errorMessage: message.slice(0, 2000) })
    .where(
      and(eq(ebookRevision.id, revisionId), eq(ebookRevision.status, "pending"), ownedBookExists),
    );
}
