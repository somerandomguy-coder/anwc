# Reference study: Omarchy's agentic QA (ThePrimeagen's Oligarchy)

Status: reference material. Surveyed 2026-11-26. Nothing is copied into ANWC.

## What it is

Omarchy is DHH's opinionated Arch Linux + Hyprland desktop. On 2026-09-26 DHH announced that ThePrimeagen joined Omarchy Core to lead "Agentic QA" ([Omarchy News](https://omarchy.org/news/2026/09/theprimeagen-joins-omarchy-core/)). His harness, **Oligarchy**, boots Omarchy in QEMU virtual machines and lets agents drive them like a person: keystrokes and mouse through QMP, screenshots to look, a fresh disk per test ticket. On 2026-10-19 he said it would start running against nightly builds, with "still some huge hurdles" ([Omarchy Central](https://omarchycentral.com/news/theprimeagen-starts-hooking-omarchys-agentic-qa-up-to-nightly-builds/)).

The `ThePrimeagen/Oligarchy` repository returned 404 on 2026-11-26 (private, renamed or removed); its pull-request titles were still in search indexes. The public evidence is the test definitions upstreamed in [omacom/omarchy#16926](https://github.com/omacom/omarchy/pull/16926), "The initial oligarchy tests", whose description says "I am still thinking through what tests should look like... it is not obvious."

Omarchy's own repository also has agent skills for visual work: `agents/skills/visual-verification.md` and `agents/skills/acceptance-tests.md`.

## How a test looks

Each test is a JSON file in `oligarchy-tests/` with `name`, `kind` (`setup` boots and installs; `resume` starts from the installed desktop), `context`, `steps` and `proof`:

- **Every step pairs an action with an observable outcome:** "Press Super+Escape. The System menu opens." "Type `zzqqxx`. The menu shows 'No matches…'. No row is shown."
- **`context` lists known quirks so the agent doesn't file false bugs:** "The lock screen turns black 5 seconds after the last key... Do not report a missing clock." Edge-build differences are spelled out too.
- **`proof` states, before the run, what evidence counts:** which final screen and supporting screens prove success, and what failure looks like.
- **The input path is part of the test:** "Use the mouse only", "Use the keyboard only". The acceptance-test skill notes that in-guest `wtype` typing "does not reliably prove that a global Hyprland keybinding works"; compositor shortcuts go through QMP.

The judge is the agent reading screenshots. Prime described it as an "agent test harness where they decide what is good".

## Lessons for ANWC

1. **Test behaviour, not presentation.** Oligarchy PR #180 (search snippet, 2026-09-21) dropped dashboard tests of fonts, colours and icons, kept tests of what a page shows, what a search finds and what a control submits, and told agents not to add presentational tests. Same line ANWC draws: functional layout, not taste.
2. **State the expected outcome with every action.** Our state manifests do this with selectors and assertions; Oligarchy does it in plain language an agent can write. Idea: let a plain-language test (step, expected outcome, proof) compile to an ANWC state manifest, with ANWC supplying the measured proof a screenshot can't (hit testing, clipping, source lines). That is an honest use of the "web compiler" name.
3. **Declare the proof up front.** Our `proves` field and `verified` rules are the machine version of Oligarchy's `proof`. A test that names its evidence before running can't be graded generously afterwards.
4. **Known-acceptable states prevent false reports.** Their `context` quirks play the role of our `data-anwc-allow`.
5. **The input path matters for proof.** Their "QMP, not wtype, for global shortcuts" is the same principle as our "unforced click on the exact element": a check that takes a shortcut proves less.
6. **Isolation per test.** A fresh disk per ticket, like our disposable demo copy and per-capture storage isolation.
7. **Demand evidence.** Omarchy's visual-verification skill tells agents to inspect screenshots "for clipping, overlap, incorrect spacing, stale state, focus problems, and visual regressions" and requires before/after captures in pull requests. That is a hand-written, screenshot-based version of the checklist ANWC measures for web apps (clipping and overlap directly; spacing, stale state and focus not yet).
8. **Motion is checked frame by frame** (record, then tile frames with ffmpeg). ANWC measures settled states only; this is where screenshots and video stay necessary.

## Where it doesn't apply

Omarchy is a Linux desktop (Hyprland, Quickshell), not a web app, so ANWC's Vite plugin and DOM measurement don't reach it. Desktop UI is agent-desktop's territory (accessibility trees; see [AGENT_DESKTOP](AGENT_DESKTOP.md)). Don't claim ANWC could test Omarchy, and don't imply any endorsement.
