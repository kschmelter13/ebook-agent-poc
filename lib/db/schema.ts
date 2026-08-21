import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import type { Ebook } from "@/agent/lib/ebook";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    eveSession: jsonb("eve_session").$type<ClientSessionState | null>(),
    pendingUserMessage: text("pending_user_message"),
    pendingUserMessageCreatedAt: timestamp("pending_user_message_created_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_user_updated").on(table.userId, table.updatedAt),
    index("idx_chat_user_created").on(table.userId, table.createdAt),
  ],
);

export const chatEvent = pgTable(
  "chat_event",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    eventIndex: integer("event_index").notNull(),
    event: jsonb("event").$type<MessageStreamEvent>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_event_chat").on(table.chatId),
    uniqueIndex("idx_chat_event_chat_index").on(table.chatId, table.eventIndex),
  ],
);

export const ebook = pgTable(
  "ebook",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    title: text("title").notNull(),
    currentRevisionId: text("current_revision_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("idx_ebook_owner_updated").on(table.ownerKey, table.updatedAt)],
);

export const ebookRevisionStatus = ["pending", "complete", "failed"] as const;

export const ebookRevision = pgTable(
  "ebook_revision",
  {
    id: text("id").primaryKey(),
    ebookId: text("ebook_id")
      .notNull()
      .references(() => ebook.id, { onDelete: "cascade" }),
    parentRevisionId: text("parent_revision_id"),
    revisionNumber: integer("revision_number").notNull(),
    status: text("status", { enum: ebookRevisionStatus }).notNull().default("pending"),
    source: jsonb("source").$type<Ebook>().notNull(),
    contentHash: text("content_hash").notNull(),
    changeSummary: text("change_summary").notNull(),
    pageCount: integer("page_count"),
    pdfUrl: text("pdf_url"),
    sourceUrl: text("source_url"),
    coverUrl: text("cover_url"),
    coverSource: text("cover_source", { enum: ["ai", "designed", "reused"] }),
    storage: text("storage", { enum: ["vercel-blob", "local"] }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.ebookId, table.parentRevisionId],
      foreignColumns: [table.ebookId, table.id],
      name: "ebook_revision_parent_revision_id_fk",
    }),
    index("idx_ebook_revision_ebook_created").on(table.ebookId, table.createdAt),
    uniqueIndex("idx_ebook_revision_number").on(table.ebookId, table.revisionNumber),
    unique("ebook_revision_identity").on(table.ebookId, table.id),
    check("ebook_revision_number_positive", sql`${table.revisionNumber} > 0`),
    check(
      "ebook_revision_parent_shape",
      sql`(${table.revisionNumber} = 1 AND ${table.parentRevisionId} IS NULL) OR (${table.revisionNumber} > 1 AND ${table.parentRevisionId} IS NOT NULL)`,
    ),
    check(
      "ebook_revision_page_count_range",
      sql`${table.pageCount} IS NULL OR ${table.pageCount} BETWEEN 10 AND 50`,
    ),
    check(
      "ebook_revision_status_shape",
      sql`
        (${table.status} = 'pending' AND ${table.completedAt} IS NULL AND ${table.errorMessage} IS NULL)
        OR
        (${table.status} = 'failed' AND ${table.completedAt} IS NULL AND ${table.errorMessage} IS NOT NULL)
        OR
        (${table.status} = 'complete' AND ${table.completedAt} IS NOT NULL AND ${table.errorMessage} IS NULL
          AND ${table.pageCount} IS NOT NULL AND ${table.pdfUrl} IS NOT NULL
          AND ${table.sourceUrl} IS NOT NULL AND ${table.coverSource} IS NOT NULL
          AND ${table.storage} IS NOT NULL)
      `,
    ),
  ],
);

export type Chat = typeof chat.$inferSelect;
export type ChatEvent = typeof chatEvent.$inferSelect;
export type EbookRecord = typeof ebook.$inferSelect;
export type EbookRevision = typeof ebookRevision.$inferSelect;
export type User = typeof user.$inferSelect;
