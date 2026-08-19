import { readFile } from "node:fs/promises";
import path from "node:path";

const allowedFiles = new Map([
  ["ebook.pdf", "application/pdf"],
  ["source.json", "application/json"],
  ["cover.png", "image/png"],
]);

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ artifactId: string; filename: string }> },
) {
  const { artifactId, filename } = await params;
  const contentType = allowedFiles.get(filename);

  if (!/^[a-f0-9]{16}$/.test(artifactId) || !contentType) {
    return Response.json({ error: "Artifact not found" }, { status: 404 });
  }

  try {
    const file = await readFile(
      path.join(process.cwd(), ".local-artifacts", artifactId, filename),
    );
    return new Response(file, {
      headers: {
        "Content-Disposition": filename === "ebook.pdf" ? "inline" : "attachment",
        "Content-Type": contentType,
      },
    });
  } catch {
    return Response.json({ error: "Artifact not found" }, { status: 404 });
  }
}
