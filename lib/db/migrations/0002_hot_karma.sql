CREATE TABLE "ebook" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_key" text NOT NULL,
	"title" text NOT NULL,
	"current_revision_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ebook_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"ebook_id" text NOT NULL,
	"parent_revision_id" text,
	"revision_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"change_summary" text NOT NULL,
	"page_count" integer,
	"pdf_url" text,
	"source_url" text,
	"cover_url" text,
	"cover_source" text,
	"storage" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "ebook_revision_number_positive" CHECK ("ebook_revision"."revision_number" > 0),
	CONSTRAINT "ebook_revision_parent_shape" CHECK (("ebook_revision"."revision_number" = 1 AND "ebook_revision"."parent_revision_id" IS NULL) OR ("ebook_revision"."revision_number" > 1 AND "ebook_revision"."parent_revision_id" IS NOT NULL)),
	CONSTRAINT "ebook_revision_page_count_range" CHECK ("ebook_revision"."page_count" IS NULL OR "ebook_revision"."page_count" BETWEEN 10 AND 50),
	CONSTRAINT "ebook_revision_status_shape" CHECK (
        ("ebook_revision"."status" = 'pending' AND "ebook_revision"."completed_at" IS NULL AND "ebook_revision"."error_message" IS NULL)
        OR
        ("ebook_revision"."status" = 'failed' AND "ebook_revision"."completed_at" IS NULL AND "ebook_revision"."error_message" IS NOT NULL)
        OR
        ("ebook_revision"."status" = 'complete' AND "ebook_revision"."completed_at" IS NOT NULL AND "ebook_revision"."error_message" IS NULL
          AND "ebook_revision"."page_count" IS NOT NULL AND "ebook_revision"."pdf_url" IS NOT NULL
          AND "ebook_revision"."source_url" IS NOT NULL AND "ebook_revision"."cover_source" IS NOT NULL
          AND "ebook_revision"."storage" IS NOT NULL)
      )
);
--> statement-breakpoint
ALTER TABLE "ebook_revision" ADD CONSTRAINT "ebook_revision_ebook_id_ebook_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_revision" ADD CONSTRAINT "ebook_revision_parent_revision_id_fk" FOREIGN KEY ("ebook_id","parent_revision_id") REFERENCES "public"."ebook_revision"("ebook_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ebook_owner_updated" ON "ebook" USING btree ("owner_key","updated_at");--> statement-breakpoint
CREATE INDEX "idx_ebook_revision_ebook_created" ON "ebook_revision" USING btree ("ebook_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ebook_revision_number" ON "ebook_revision" USING btree ("ebook_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ebook_revision_identity" ON "ebook_revision" USING btree ("ebook_id","id");