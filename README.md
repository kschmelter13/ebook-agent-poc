# Booksmith

Booksmith is a minimal proof-of-concept ebook agent built with [eve](https://eve.dev),
Next.js, and Vercel. A user develops a focused guide through chat, approves its
outline, and receives a designed 10–50 page PDF with a cover, table of contents,
content pages, page numbers, and an editable JSON source artifact.

## Stack

- eve `0.39.2` for durable agent sessions and tools
- Next.js 16 and the official eve chat template
- Vercel AI Gateway for writing and AI cover generation
- `@react-pdf/renderer` for deterministic PDF layout
- Vercel Blob for durable PDF, cover, and JSON storage
- Password access and browser-local chat history for the single-operator POC

## Local development

Requirements: Node.js 24+, Corepack, and pnpm 10.12.4.

```bash
corepack enable
pnpm install
pnpm dev
```

Local development works without a database. If AI Gateway credentials or Blob
are unavailable, cover generation falls back to designed vector artwork and
artifacts are written to `.local-artifacts/` for local verification.

To require password access locally, create `.env.local`:

```dotenv
EVE_CHAT_PASSWORD=use-a-strong-password-at-least-16-characters
```

## Production

The starter deployment requires only `EVE_CHAT_PASSWORD`. Vercel AI Gateway and
Blob use the linked project's OIDC identity; no provider API key or database is
required.

Deploy with eve so its Workflow and agent routes are packaged correctly:

```bash
pnpm eve deploy --project ebook-agent-poc --non-interactive --yes
```

Neon, Upstash, and Sign in with Vercel remain available through the inherited
template but are intentionally not provisioned for this POC.
