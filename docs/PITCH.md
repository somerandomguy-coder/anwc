# Pitch runbook

Current capability and evidence: [STATUS](STATUS.md). This page is the script: what to run, what to say, what not to claim.

## The one line

**ANWC is the check an AI coding agent has to pass before it can say a web UI bug is fixed.**

In plain words: a coding agent can change your page but cannot tell whether the button now works. ANWC measures the page in a real browser, points at the source line, and says whether the repair was proven.

Who it is for: teams using coding agents on React and Vite apps, and the agents themselves.

## Before you present

Do this on the presenting machine, at least an hour early.

```powershell
npm ci
npx playwright install chromium
npm run build
npm run demo
npm run demo:cheat
```

Both demo commands must end without an error. Then start two terminals and leave them running:

```powershell
npm run dev -- --host 127.0.0.1 --port 4175 --strictPort
```

```powershell
npm run anwc -- studio --port 4180
```

Set the terminal font to at least 18 pt. Close anything else on ports 4175 and 4180. Both repairs in the demo are scripted, not made by an agent; say so. Everything runs offline after installation, so no network is needed on stage.

**If a live step fails:** open `artifacts/demo/before.html` and `artifacts/demo/after.html` from your rehearsal. They are single offline files.

## The demo, about three minutes

| Time | Do | Say |
| --- | --- | --- |
| 0:00 | Studio open on "Shop: checkout covered" | "This checkout button is covered by a cookie notice. The fault is planted so you can see it." |
| 0:20 | Point at the red marks, then the panel | "ANWC tried 25 points on that button. All 25 hit the notice. Here is the button's source line, and here is the line that covers it." |
| 0:45 | Click **X-Ray Overlay**, then **Copy brief for agent** | "That is drawn on the live page. This copies the evidence straight to a coding agent." |
| 1:05 | Run `npm run demo:cheat` | "Now a fake repair, scripted. It hides the button, so the original error disappears. Most checks would call that clean." |
| 1:25 | Point at **CONTRADICTED** | "ANWC rejects it: hiding the target is not a repair." |
| 1:40 | Run `npm run demo` | "Now the real fix. Same page, same size. The error is gone, and a real click that failed before now works." |
| 2:05 | Point at **VERIFIED** | "It only says verified because the click was executed on that same button and changed the result." |
| 2:20 | Point at the scope line | "And it says what it did not prove: this finding, in this state. Not the whole page." |

The "most checks" line refers to checks that only look for the original error. Say it that way if pressed.

## Questions to expect

**Isn't this what Chrome DevTools for agents does?** It gives an agent a browser to look with ([Google](https://developer.chrome.com/blog/chrome-devtools-mcp)). ANWC gives a judged answer: what was measured, which source line, and whether the repair was proven. They work together.

**Isn't this visual regression testing?** Those tools compare with an approved picture; some already return JSON to agents ([Argos](https://argos-ci.com/blog/visual-testing-ai-coding-agents)). ANWC needs no approved picture to find a covered button, and it checks behavior, not similarity.

**Is this a real problem?** In the original SWE-bench Multimodal paper (2024), the best system solved 12% of visual front-end issues ([paper](https://arxiv.org/abs/2410.03859)). Newer models do better; quote it as the 2024 baseline. Cookie notices covering buttons on phones are a documented support issue ([TermsFeed](https://www.termsfeed.com/docs/cookie-consent/troubleshooting/banner-covers-content-shifts-layout/)).

**Does it make agents faster or cheaper?** Not measured yet. The paired study is designed and is the next milestone.

**Does it use AI?** No model is involved in measuring or judging, so results are repeatable and nothing leaves the machine.

**What does it support?** React with Vite, in Chromium, during development. Nine kinds of layout and pointer defects. A `verified` result currently covers pointer defects proven by a click.

**What does it miss?** Painted pixels, closed shadow roots, canvas, and thin overlays that fall between sample points. These are documented, and incomplete captures are never reported as clean.

## Do not claim

- That it is the first or only tool of its kind. One round of searching found no other tool that ties overlap and clipping detection to React source lines; that is not proof.
- Any saving in time, tokens or cost.
- That "no findings" or "verified" means the page is correct.
- That it has customers, or works on any website.
- That the demo bug was found in the wild. It is planted.

## The ask and next milestone

Fill in the ask for your audience. The milestone that de-risks the idea is the paired study in [PHASE_4](PHASE_4.md) P17: the same agent, with and without ANWC, on defects written by someone else.
