import assert from "node:assert/strict";
import test from "node:test";
import type { SessionAuthContext } from "eve/context";
import { hashEbook, slugify, type Ebook } from "./ebook.js";
import { ebookOperationId, requireEbookOwnerKey } from "./ebook-owner.js";

const auth = (principalId: string, issuer = "https://example.test") =>
  ({
    attributes: {},
    authenticator: "oidc",
    issuer,
    principalId,
    principalType: "user",
  }) satisfies SessionAuthContext;

const source: Ebook = {
  title: "Revision-safe Guide",
  author: "Booksmith",
  audience: "Editors testing revision behavior",
  description: "A sufficiently detailed description used to validate stable ebook source hashes.",
  targetPages: 12,
  coverPrompt: "A clean editorial arrangement of paper and pencils on a dark blue desk.",
  coverStyle: "editorial",
  chapters: Array.from({ length: 8 }, (_, index) => ({
    title: `Chapter ${index + 1}`,
    introduction: "A sufficiently detailed introduction that establishes the purpose of this chapter.",
    sections: [
      {
        heading: "A practical section",
        paragraphs: [
          "This paragraph is deliberately long enough to satisfy the source validation constraints.",
          "This second paragraph supplies another concrete sentence for the validated ebook source.",
        ],
      },
    ],
  })),
};

test("owner keys are stable and isolate principals and issuers", () => {
  const first = requireEbookOwnerKey(auth("user-1"));

  assert.equal(first, requireEbookOwnerKey(auth("user-1")));
  assert.notEqual(first, requireEbookOwnerKey(auth("user-2")));
  assert.notEqual(first, requireEbookOwnerKey(auth("user-1", "https://other.test")));
  assert.throws(() => requireEbookOwnerKey(null), /Sign in/);
});

test("operation IDs are replay-safe and separate ebook and revision identities", () => {
  const ownerKey = requireEbookOwnerKey(auth("user-1"));

  assert.equal(
    ebookOperationId("revision", ownerKey, "call-1"),
    ebookOperationId("revision", ownerKey, "call-1"),
  );
  assert.notEqual(
    ebookOperationId("ebook", ownerKey, "call-1"),
    ebookOperationId("revision", ownerKey, "call-1"),
  );
  assert.match(ebookOperationId("revision", ownerKey, "call-1"), /^[a-f0-9]{32}$/);
});

test("ebook hashes are stable and change with edited source", () => {
  assert.equal(hashEbook(source), hashEbook(structuredClone(source)));
  assert.notEqual(hashEbook(source), hashEbook({ ...source, title: "A Revised Guide" }));
});

test("artifact slugs are safe and deterministic", () => {
  assert.equal(slugify("  Café & Craft  "), "cafe-craft");
});
