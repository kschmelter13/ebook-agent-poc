import { createHash } from "node:crypto";
import type { SessionAuthContext } from "eve/context";

export function requireEbookOwnerKey(auth: SessionAuthContext | null) {
  if (!auth) {
    throw new Error("Sign in to manage ebooks.");
  }

  return createHash("sha256")
    .update(
      [auth.issuer ?? auth.authenticator, auth.principalType, auth.principalId].join("\u0000"),
    )
    .digest("hex");
}

export function ebookOperationId(kind: "ebook" | "revision", ownerKey: string, callId: string) {
  return createHash("sha256")
    .update([kind, ownerKey, callId].join("\u0000"))
    .digest("hex")
    .slice(0, 32);
}
