import { z } from "zod";

export const ebookSectionSchema = z.object({
  heading: z.string().min(3).max(120),
  paragraphs: z.array(z.string().min(40).max(2200)).min(2).max(8),
  bullets: z.array(z.string().min(8).max(300)).max(8).optional(),
  takeaway: z.string().min(20).max(500).optional(),
});

export const ebookChapterSchema = z.object({
  title: z.string().min(3).max(120),
  introduction: z.string().min(40).max(1200),
  sections: z.array(ebookSectionSchema).min(1).max(5),
});

export const ebookSchema = z.object({
  title: z.string().min(3).max(100),
  subtitle: z.string().min(3).max(180).optional(),
  author: z.string().min(2).max(100),
  audience: z.string().min(3).max(240),
  description: z.string().min(40).max(800),
  targetPages: z.number().int().min(10).max(50),
  coverPrompt: z.string().min(20).max(1200),
  coverStyle: z
    .enum(["editorial", "illustrated", "minimal", "photographic"])
    .default("editorial"),
  chapters: z.array(ebookChapterSchema).min(8).max(20),
});

export type Ebook = z.infer<typeof ebookSchema>;

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "ebook";
}
