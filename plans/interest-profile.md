# Personal interest profile

**Fork:** A.
**Queue position:** sixth — last of the sequenced Fork-A items, after the
emergence feed.
**Status:** not started. Horizon item, but with a concrete requirement that
lands *now* (see "The one thing to do immediately").

## Why it's nearly free

The profile **is** the cluster centroids plus weights plus recency. Once
sources are embedded, tagged, and clustered, it's a derived view — not new
infrastructure. That's why it sits this late in the queue without being
speculative: it needs no new mechanism, only the substrate that items 1–5
build.

Resisting the urge to build it earlier is the point. Built before the
substrate, it would be a profile derived from an untagged, duplicate-heavy
pile — which is the accumulation-before-AI failure mode in miniature.

## Sequencing, in three steps

**1. Near-term — an explicit stored profile.** Materialize the derived view:
cluster centroids, tag weights, recency decay. Its job is to **rank the
emergence feed** — the feed without a profile shows what's related, the feed
with one shows what's related *and* matters to you. Stored rather than
computed per request, because it changes slowly and the feed reads it often.

**2. Later — inbound discovery.** The profile scans streams the user hasn't
saved from (RSS, newsletters) and flags matches. This inverts the product:
until now every source arrived because the user chose it. Deferred until step
1 is real and trusted, because a profile that ranks your own saves badly will
recommend strangers' content worse.

**3. End-game — design for it, don't build it.** Company-wide / multi-user
cross-referencing: whose saves overlap with whose, what the org is
collectively paying attention to. Explicitly not being built. It exists in
this doc only to constrain one decision today.

## The one thing to do immediately

**Keep user-scoping clean and explicit in the Sources-table key design**, so
a second user is additive later rather than a migration.

Cheap now, expensive to retrofit. The `Sources` table is `TableV2` with
`RemovalPolicy.RETAIN` and deletion protection on, PK `contentHash`, GSI
`UrlIndex` on `url`. There is no user dimension anywhere in that key design,
and every query today implicitly means "all of it, for the one user."

This does not mean building multi-user support. It means: when the S3 layer
and SourceHealth touch these items anyway (queue items 1 and 3), do not add
new access patterns that assume a single global corpus. Concretely — any new
GSI or scan added for tagging, clustering, or the feed should carry an owner
dimension in its key even while there's exactly one owner, and new endpoints
should read the owner from the Cognito claim rather than treating the corpus
as global. A GSI added without it is the retrofit this note exists to
prevent.

Worth noting the tension honestly: `contentHash` as PK means one item per
piece of content, which is *good* for dedup and *wrong* for per-user
ownership (two users saving the same article). Resolving that properly is a
key-design change and out of scope here. Flagging it is in scope, and the
right time to actually decide is whenever a second user stops being
hypothetical — not now, and not silently.

## Rejected

**Save-time "this looks interesting" popups.** The signal came from the
user's own save; echoing it back is noise. See `plans/emergence-feed.md` for
what save-time reactions must be instead (relational, not evaluative).

## Local-model fit

Good: centroid/weight/decay math as pure functions with tests, the profile
serialization. Keep on Claude/Pi: any key-design or GSI decision — that's
precisely the "cross-file architectural judgment" category, and it's the one
choice in this doc that's expensive to reverse.
