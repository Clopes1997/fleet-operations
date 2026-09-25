# Source provenance

This monorepo was created from the current working tree of `../trucks-system` on 2026-09-24, including authorized uncommitted consolidation changes. Original repository HEAD: `bbfc9a0c726d4931c337964dc1e155014f7cc9db`.

The source repository and its full Git history remain in place. This copy has a separate Git root; no old history was rewritten. Dependencies, generated builds, Git internals, credentials and databases were excluded. Import/reconciliation gates apply before any source retirement. The monorepo is the target for subsequent implementation; the originals are reference/rollback copies, not synchronized development trees.

Domain modules remain inside the owning application. Shared packages should be extracted only when they have more than one real consumer. Database migrations stay under their framework's normal migration directory.
