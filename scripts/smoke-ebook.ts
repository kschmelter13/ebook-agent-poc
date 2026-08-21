import { access } from "node:fs/promises";
import path from "node:path";
import { buildEbookArtifact } from "../agent/lib/ebook-artifact.js";
import type { Ebook } from "../agent/lib/ebook.js";

const chapterTopics = [
  "Define the reader's real problem",
  "Choose a narrow promise",
  "Build a useful structure",
  "Write with practical clarity",
  "Use examples that teach",
  "Design an easy reading path",
  "Revise for momentum",
  "Publish and learn",
];

const book: Ebook = {
  title: "The Focused Guide",
  subtitle: "A practical system for turning expertise into a useful short ebook",
  author: "Booksmith",
  audience: "Independent experts creating their first concise educational product",
  description:
    "A compact field guide to choosing a specific reader problem, shaping a credible promise, and publishing a short ebook people can actually use.",
  targetPages: 12,
  coverPrompt:
    "An elegant editorial still life of an open notebook, a precise pencil, and layered paper forms, photographed from above with deep navy and warm amber accents.",
  coverStyle: "editorial",
  chapters: chapterTopics.map((title, index) => ({
    title,
    introduction:
      "This chapter turns one important publishing decision into a concrete action. Work through it before moving on so every later choice has a clear foundation.",
    sections: [
      {
        heading: `Practice ${index + 1}: make the decision visible`,
        paragraphs: [
          "Start by writing the decision in one plain sentence. A visible decision is easier to test than an intuition, and it gives every later draft a standard against which it can be evaluated.",
          "Then pressure-test the sentence with a realistic reader scenario. Remove anything that depends on vague ambition, add the constraint that matters most, and keep the version that leads to a specific next action.",
        ],
        bullets: [
          "Name the reader and the moment in which they need help.",
          "Prefer a small useful outcome over a broad transformation.",
          "Keep one sentence that can guide the next drafting session.",
        ],
        takeaway:
          "A concise ebook becomes useful when each chapter resolves one visible decision for the reader.",
      },
    ],
  })),
};

const artifact = await buildEbookArtifact(book, { cover: { mode: "designed" } });

if (artifact.storage !== "local") {
  throw new Error(`Expected local storage during smoke test, received ${artifact.storage}.`);
}

if (artifact.pageCount < 10 || artifact.pageCount > 50) {
  throw new Error(`Expected 10–50 pages, received ${artifact.pageCount}.`);
}

const artifactDirectory = path.join(process.cwd(), ".local-artifacts", artifact.artifactId);
await Promise.all([
  access(path.join(artifactDirectory, "ebook.pdf")),
  access(path.join(artifactDirectory, "source.json")),
]);

console.log(
  JSON.stringify(
    {
      artifactId: artifact.artifactId,
      pageCount: artifact.pageCount,
      pdfPath: path.join(artifactDirectory, "ebook.pdf"),
    },
    null,
    2,
  ),
);
