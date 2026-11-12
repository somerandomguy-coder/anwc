import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { detectorRuleCodes } from '../conformance/rule-codes.js';

/**
 * P15 doc-drift gate. Commands, flags, enumerated flag values, `npm run`
 * scripts and stated command/script/rule lists in README, QUICKSTART and
 * AGENTS (plus the rule-code list in CONCEPTS) must agree with the CLI's own
 * source: the command dispatch (`[0] === 'cmd'`), the `'--flag'` literals in
 * each command's parser, and package.json scripts.
 *
 * Deliberately not checked: exit codes and JSON output shapes (owned by P01
 * and PROTOCOL), and flags of third-party tools beyond a short allowlist.
 *
 * Each check runs first against planted drift (the canary) so a checker that
 * stops finding anything fails the suite instead of passing silently.
 */

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const checkedDocs = ['README.md', 'docs/QUICKSTART.md', 'AGENTS.md'];

// ---------------------------------------------------------------------------
// CLI model, parsed from source

/** Index just past the brace block that opens at or after `from`, skipping strings, templates and comments. */
function blockEnd(source: string, from: number): number {
  let i = source.indexOf('{', from);
  if (i < 0) return source.length;
  const stack: Array<'{' | '`'> = [];
  for (; i < source.length; i++) {
    const ch = source[i]!;
    const top = stack[stack.length - 1];
    if (top === '`') {
      if (ch === '\\') { i++; continue; }
      if (ch === '`') stack.pop();
      else if (ch === '$' && source[i + 1] === '{') { stack.push('{'); i++; }
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') { i = source.indexOf('\n', i); if (i < 0) return source.length; continue; }
    if (ch === '/' && source[i + 1] === '*') { i = source.indexOf('*/', i + 2) + 1; continue; }
    if (ch === "'" || ch === '"') {
      for (i++; i < source.length && source[i] !== ch; i++) if (source[i] === '\\') i++;
      continue;
    }
    if (ch === '`') { stack.push('`'); continue; }
    if (ch === '{') stack.push('{');
    else if (ch === '}') { stack.pop(); if (stack.length === 0) return i + 1; }
  }
  return source.length;
}

/** Start of the top-level function declaration that contains `index`. */
function enclosingFunctionStart(source: string, index: number): number {
  const before = source.slice(0, index);
  const matches = [...before.matchAll(/^(?:export\s+)?(?:async\s+)?function\s/gm)];
  return matches.length ? matches[matches.length - 1]!.index! : 0;
}

export interface CliModel {
  commands: Set<string>;
  /** Source text that defines each command's arguments. */
  regions: Map<string, string>;
}

export function cliModel(sources: string[]): CliModel {
  const commands = new Set<string>();
  const regions = new Map<string, string>();
  const add = (command: string, text: string) => regions.set(command, `${regions.get(command) ?? ''}\n${text}`);
  for (const source of sources) {
    for (const match of source.matchAll(/\[0\]\s*([!=])==\s*'([a-z][a-z-]*)'/g)) {
      const command = match[2]!;
      commands.add(command);
      if (match[1] === '=') add(command, source.slice(match.index!, blockEnd(source, match.index!)));
    }
    for (const match of source.matchAll(/Usage: anwc ([a-z][a-z-]*)/g)) {
      const start = enclosingFunctionStart(source, match.index!);
      add(match[1]!, source.slice(start, blockEnd(source, start)));
    }
  }
  return { commands, regions };
}

const flagsIn = (text: string) => new Set([...text.matchAll(/'(--[a-z][a-z-]*)'/g)].map((m) => m[1]!));
const literalIn = (text: string, value: string) => text.includes(`'${value}'`);

function realCli(): CliModel {
  const dir = join(root, 'packages/cli/src');
  return cliModel(readdirSync(dir).filter((f) => f.endsWith('.ts')).map((f) => readFileSync(join(dir, f), 'utf8')));
}

function benchModel(source: string): { commands: Set<string>; flags: Set<string> } {
  return { commands: new Set([...source.matchAll(/command === '([a-z][a-z-]*)'/g)].map((m) => m[1]!)), flags: flagsIn(source) };
}

// ---------------------------------------------------------------------------
// Doc extraction

/** Code fragments: fenced block lines and inline code spans, with their line numbers. */
export function codeFragments(markdown: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  let fenced = false;
  markdown.split(/\r?\n/).forEach((raw, index) => {
    if (/^\s*```/.test(raw)) { fenced = !fenced; return; }
    if (fenced) { out.push({ line: index + 1, text: raw }); return; }
    for (const m of raw.matchAll(/`([^`]+)`/g)) out.push({ line: index + 1, text: m[1]! });
  });
  return out;
}

function tokens(text: string): string[] {
  return [...text.matchAll(/"[^"]*"|'[^']*'|\S+/g)].map((m) => m[0].replace(/^["']|["']$/g, ''));
}

const placeholder = (value: string) => /^<.*>$/.test(value) || /^[A-Z][A-Z_x]*$/.test(value) || value.includes('$');
/** Flags whose documented values must be literals in the parser. */
const enumeratedFlags = new Set(['--format', '--query', '--fail-on', '--severity']);
/** Flags documented for other tools (npm, vite, tsc) in the checked docs. */
const foreignFlags = new Set(['--host', '--port', '--strictPort', '--save-dev', '--workspace', '--config', '--build']);

export interface DocInput { name: string; text: string }
export interface Repo { cli: CliModel; bench: { commands: Set<string>; flags: Set<string> }; scripts: Record<string, Record<string, string>> }

export function docProblems(docs: DocInput[], repo: Repo): string[] {
  const problems: string[] = [];
  const allCliFlags = new Set([...repo.cli.regions.values()].flatMap((text) => [...flagsIn(text)]));
  for (const doc of docs) {
    for (const { line, text } of codeFragments(doc.text)) {
      const where = `${doc.name}:${line}`;

      // anwc invocations
      for (const m of text.matchAll(/(?:^|[\s(])(?:npx\s+anwc|npm\s+run\s+anwc\s+--|anwc)\s+([a-z][a-z-]*)([^\n]*)/g)) {
        const command = m[1]!;
        if (!repo.cli.commands.has(command)) { problems.push(`${where}: unknown anwc command '${command}'`); continue; }
        const region = repo.cli.regions.get(command) ?? '';
        const defined = flagsIn(region);
        const args = tokens(m[2]!.split(/\s(?:\||&&|;|#|>)\s/)[0]!);
        args.forEach((token, i) => {
          if (!token.startsWith('--')) return;
          if (!defined.has(token)) { problems.push(`${where}: 'anwc ${command}' has no flag ${token}`); return; }
          const value = args[i + 1];
          if (enumeratedFlags.has(token) && value && !value.startsWith('-') && !placeholder(value)) {
            for (const alternative of value.split('|')) {
              if (!literalIn(region, alternative)) problems.push(`${where}: 'anwc ${command} ${token}' does not accept '${alternative}'`);
            }
          }
        });
      }

      // npm scripts and the evaluator CLI
      for (const m of text.matchAll(/npm\s+run\s+([a-z][\w:-]*)([^\n]*)/g)) {
        const script = m[1]!;
        const workspace = /(?:--workspace[= ]|-w\s+)(\S+)/.exec(m[2]!)?.[1];
        const scripts = repo.scripts[workspace ?? '<root>'];
        if (!scripts) problems.push(`${where}: unknown workspace ${workspace}`);
        else if (!(script in scripts)) problems.push(`${where}: package ${workspace ?? 'root'} has no script '${script}'`);
        if (script === 'bench') {
          const rest = tokens(m[2]!.replace(/^\s*--\s*/, ''));
          const command = rest[0];
          if (command && /^[a-z][a-z-]*$/.test(command) && !repo.bench.commands.has(command)) problems.push(`${where}: unknown bench command '${command}'`);
          for (const flag of rest.filter((t) => t.startsWith('--'))) if (!repo.bench.flags.has(flag)) problems.push(`${where}: bench has no flag ${flag}`);
        }
      }

      // Any flag mentioned in code must exist somewhere we know of
      for (const m of text.matchAll(/(?:^|\s)(--[a-zA-Z][a-zA-Z-]*)/g)) {
        const flag = m[1]!;
        if (!allCliFlags.has(flag) && !repo.bench.flags.has(flag) && !foreignFlags.has(flag)) problems.push(`${where}: flag ${flag} is not defined by the anwc or bench CLI`);
      }
    }
  }
  return [...new Set(problems)];
}

/** Stated lists: the CLI command list and the root-script table in AGENTS. */
export function statedListProblems(agents: string, repo: Repo): string[] {
  const problems: string[] = [];
  const backticked = (text: string) => [...text.matchAll(/`([a-z][a-z-]*)`/g)].map((m) => m[1]!);
  const commandLists = agents.split(/\r?\n/).filter((line) => /a CLI \(|Runs the CLI from source/.test(line));
  if (commandLists.length === 0) problems.push('AGENTS.md: no stated CLI command list found');
  const expected = [...repo.cli.commands].sort();
  for (const line of commandLists) {
    const list = line.includes('a CLI (') ? line.split('a CLI (')[1]!.split(')')[0]! : line.slice(line.lastIndexOf(':'));
    const stated = [...new Set(backticked(list))].sort();
    if (JSON.stringify(stated) !== JSON.stringify(expected)) problems.push(`AGENTS.md: states commands [${stated.join(', ')}], CLI has [${expected.join(', ')}]`);
  }
  for (const script of Object.keys(repo.scripts['<root>']!)) {
    if (!agents.includes(`npm run ${script}`)) problems.push(`AGENTS.md: root script '${script}' is missing from the commands table`);
  }
  return problems;
}

export function ruleListProblems(concepts: string, codes: string[]): string[] {
  const line = concepts.split(/\r?\n/).find((l) => l.includes('Codes in use:'));
  if (!line) return ['CONCEPTS.md: no "Codes in use" list found'];
  const stated = [...line.split('Codes in use:')[1]!.split('.')[0]!.matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]!).sort();
  return JSON.stringify(stated) === JSON.stringify([...codes].sort()) ? [] : [`CONCEPTS.md: states codes [${stated.join(', ')}], diagnose emits [${[...codes].sort().join(', ')}]`];
}

function realRepo(): Repo {
  const scripts: Repo['scripts'] = { '<root>': JSON.parse(read('package.json')).scripts };
  for (const group of ['packages', 'examples']) {
    for (const dir of readdirSync(join(root, group))) {
      const path = join(root, group, dir, 'package.json');
      if (!existsSync(path)) continue;
      const pkg = JSON.parse(readFileSync(path, 'utf8'));
      scripts[pkg.name] = pkg.scripts ?? {};
    }
  }
  return { cli: realCli(), bench: benchModel(read('packages/benchmark/src/main.ts')), scripts };
}

// ---------------------------------------------------------------------------

describe('P15 doc drift', () => {
  const repo = realRepo();

  test('the CLI model sees every command and its parser flags', () => {
    expect([...repo.cli.commands].sort()).toEqual(['check', 'diff', 'doctor', 'inspect', 'report', 'studio']);
    for (const command of repo.cli.commands) expect(repo.cli.regions.get(command), command).toBeTruthy();
    expect(flagsIn(repo.cli.regions.get('inspect')!)).toContain('--viewport');
    expect(flagsIn(repo.cli.regions.get('report')!)).toContain('--query');
    expect(repo.bench.commands).toContain('validate');
  });

  test('canary: planted drift is reported before the real docs are checked', () => {
    const planted: DocInput = {
      name: 'PLANTED.md',
      text: [
        '```bash',
        'npx anwc frobnicate page.json',
        'npx anwc inspect "http://127.0.0.1:5173/" --no-such-flag 1',
        'npx anwc report a.json --format yaml',
        'npm run no-such-script',
        'npm run bench -- no-such-bench-command',
        'npx anwc diff a.json b.json --viewport 390x844',
        '```',
        'Inline: `npx anwc inspect http://x/ --fail-on sometimes`.'
      ].join('\n')
    };
    const problems = docProblems([planted], repo);
    for (const expected of [
      "unknown anwc command 'frobnicate'",
      "'anwc inspect' has no flag --no-such-flag",
      "'anwc report --format' does not accept 'yaml'",
      "has no script 'no-such-script'",
      "unknown bench command 'no-such-bench-command'",
      "'anwc diff' has no flag --viewport",
      "'anwc inspect --fail-on' does not accept 'sometimes'"
    ]) expect(problems.some((p) => p.includes(expected)), `planted drift not caught: ${expected}\n${problems.join('\n')}`).toBe(true);

    const clean: DocInput = { name: 'CLEAN.md', text: '```bash\nnpx anwc inspect "http://127.0.0.1:5173/" --viewport 390x844 --format json --fail-on error|warning|none\nnpm run typecheck\n```' };
    expect(docProblems([clean], repo)).toEqual([]);

    const fewerCommands = 'with a CLI (`inspect`, `report`) and';
    expect(statedListProblems(fewerCommands, repo).some((p) => p.includes('states commands'))).toBe(true);
    expect(ruleListProblems('Codes in use: `HORIZONTAL_OVERFLOW`. Rest.', detectorRuleCodes())).toHaveLength(1);
  });

  test('README, QUICKSTART and AGENTS commands, flags and scripts match the CLI and package.json', () => {
    const docs = checkedDocs.map((name) => ({ name, text: read(name) }));
    // Not vacuous: the docs really contain invocations for the checker to judge.
    const invocations = docs.flatMap((doc) => codeFragments(doc.text)).filter((f) => /(?:npx\s+anwc|npm\s+run\s+anwc\s+--)\s+[a-z]/.test(f.text));
    expect(invocations.length).toBeGreaterThanOrEqual(15);
    expect(docProblems(docs, repo)).toEqual([]);
  });

  test('AGENTS command list and script table match the CLI and package.json', () => {
    expect(statedListProblems(read('AGENTS.md'), repo)).toEqual([]);
  });

  test('CONCEPTS lists exactly the rule codes diagnose emits', () => {
    expect(ruleListProblems(read('docs/CONCEPTS.md'), detectorRuleCodes())).toEqual([]);
  });
});
