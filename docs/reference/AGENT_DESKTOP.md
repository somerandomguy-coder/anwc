# Reference study: vercel-labs/agent-desktop

Status: reference material, read-only. Added 2026-11-12. Nothing from agent-desktop is vendored into ANWC.

agent-desktop is Vercel Labs' "computer use for AI agents" tool. It reads the OS accessibility tree of desktop apps (macOS AX, Windows UI Automation, Linux AT-SPI), returns it as JSON with an actionable ref per element, and lets the agent act on refs and observe again. It ships as a Rust CLI, a C library and an MCP server. It is the closest well-engineered neighbour to ANWC: same customer (a coding/operating agent), same idea (structured evidence instead of screenshots), different surface (desktop apps instead of rendered web UIs).

We study it for its agent contract, distribution and engineering process. The lessons and the work they turned into are in [PHASE_4](../PHASE_4.md).

## Where the clone lives

| Field | Value |
| --- | --- |
| Upstream | `git@github.com:vercel-labs/agent-desktop.git` (HTTPS: `https://github.com/vercel-labs/agent-desktop.git`) |
| Local path on the original machine | `C:\Users\Nam\Projects\Deploying\SWE\agent-desktop` — a sibling of this repository, **not** inside it |
| Studied commit | `54855b6225aec00da4ac65e2d0362fd41cd9fcb3` (2026-11-10, "test: run the post-action settle budget tests on the virtual clock (#642)") |
| License | Apache-2.0 (no NOTICE file at the studied commit) |
| Size | about 140 MB checked out, 3,798 files, 341 commits |

### Reproducing the clone elsewhere

From the directory that contains your `anwc` checkout:

```bash
git clone https://github.com/vercel-labs/agent-desktop.git agent-desktop
```

```bash
git -C agent-desktop checkout 54855b6225aec00da4ac65e2d0362fd41cd9fcb3
```

Use the pinned commit when you need to check a claim in this document; use `main` when you want newer ideas, and update the "Studied commit" row if you re-survey.

## Rules for agents working with the clone

1. **Read only.** Do not run its build, install, npm scripts, probes or test harnesses from ANWC tasks. It drives real desktop apps through accessibility permissions; nothing in ANWC needs that.
2. **Never place it inside the ANWC repository** and never add it as a submodule or workspace. Keep it a sibling directory.
3. **Ideas are free; copied code is not.** Re-implementing a design or interaction from scratch needs no notice. If you copy or closely translate code, CSS, SVG or assets, Apache-2.0 §4 applies: keep the upstream copyright/license header, add a "Modified by ANWC" note to changed files, and include the Apache-2.0 license text with the distribution. Record each copied file in the table at the bottom of this document.
4. **Do not copy Vercel branding** (names, logos, the "Labs" badge, product wording, the `agent-browser.dev` domain). ANWC must not look like a Vercel product.
5. **Its snapshots may contain private desktop content.** Do not paste agent-desktop output from a real desktop into ANWC fixtures, issues or reports.

## Lessons

The survey findings are summarised in [PHASE_4 §2](../PHASE_4.md#2-what-agent-desktop-teaches-us). Keep that section and this document in sync when you re-survey.

## Copied or adapted files

| ANWC file | Upstream file at studied commit | Kind (copied / translated / inspired) | Notes |
| --- | --- | --- | --- |
| _none yet_ | | | |
