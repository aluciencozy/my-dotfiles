# Personal sidebar data boundaries

This is a selective adaptation of Over9k (MIT; see `OVER9K-LICENSE.txt`),
including its agent title conventions, Linux process/rollout discovery idea,
row geometry and GitHub SVG. It does not install its scripts or updater.

When the sidebar is visible and the window active, local Git is queried every
60 seconds for root, porcelain status, local tracking ahead/behind and fetch
remote URLs. A GitHub icon opens a sanitized github.com repository URL only
after a click. No fetch, push, pull, GitHub API or background network request
is performed. Dirty counts can open the existing Changes panel.

When metadata is enabled, the sidebar runs `reader.py` at most every 30 seconds
for visible local Codex agents. It examines Linux process identifiers,
`HC_TERMINAL_ID`, Codex process argument UUIDs and open rollout descriptors.
An exact UUID in a Codex title also qualifies. Codex 0.170.0's exact
29-character UUID prefix plus `...` title form is resolved only when exactly
one database UUID matches. Multiple different UUIDs mean
no mapping: directory alone is never used. For an identified session it reads
only selected structural columns in the local Codex state SQLite database,
explicit active spawn edges and at most the last 256 KiB of the associated
rollout. Only turn model/effort and token-count event fields are extracted.
It does not print, cache, or retain prompts, command text, credentials or
transcripts. A Codex sandbox's direct non-bwrap processes are shown as generic
"Codex command" rows, never with command arguments. Data is held in memory.
State database schemas and /proc behavior are internal and may change; missing
or ambiguous evidence produces no session details. Timestamped context shows
its observation age; titles that already supply context take precedence.

Core terminal children and verified Codex native children are separate sources.
An explicitly associated native child's own recorded model, if available, is
shown with its database update time in the tooltip, not inferred from its parent.
Their count chip folds the rows; core children focus/peek their actual terminal.
Native child rows are informational, with no fabricated terminal action.
No OpenCode-internal children are inferred. The metadata option disables the
Codex reader as well as optional metadata display. For richer live title data,
Codex's `tui.terminal_title` can be configured by the user; this mod never edits
Codex configuration.
