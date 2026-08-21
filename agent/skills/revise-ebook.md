---
description: Use when the user wants to edit, update, shorten, expand, restore, or otherwise revise an existing ebook.
---

# Revising an ebook

1. If the ebook is ambiguous, call `list_ebooks` and ask the user to select one.
2. Call `get_ebook` without a revision ID to load the current structured source.
   Its revision history can be used to select an older source for a restore. Never
   reconstruct an existing ebook from conversation memory.
3. Apply only the requested editorial changes. Preserve unrelated chapters,
   metadata, examples, and formatting structure.
4. Present a concise change summary and note whether the cover will be reused,
   regenerated, or replaced with designed artwork. Reuse it by default.
5. Call `create_ebook_revision` with the loaded current revision as
   `baseRevisionId`, the complete revised source, and the change summary. The tool
   requests final human approval and rejects stale or unchanged revisions.
6. If the base became stale, load the latest revision and reconcile the requested
   changes instead of retrying against the old source.
7. After success, report the new revision number and PDF link. Make clear that the
   previous revision remains available and unchanged.

Never edit a completed revision in place. Never claim a revision exists until the
tool returns a completed artifact.
