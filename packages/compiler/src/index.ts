import { createHash } from 'node:crypto';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { parse } from '@babel/parser';
import MagicString from 'magic-string';
import type { InstrumentResult, SourceRef } from '@anwc/protocol';

export type InstrumentOptions = {
  filename: string;
  root: string;
  mode: 'development' | 'production';
};

type NodeRecord = Record<string, unknown>;
type InstrumentDiagnostic = InstrumentResult['diagnostics'][number];

const SOURCE_ATTRIBUTE = 'data-anwc-site';
const supportedExtension = /\.(?:jsx|tsx)$/i;

function asRecord(value: unknown): NodeRecord | null {
  return value !== null && typeof value === 'object' ? value as NodeRecord : null;
}

function isType(value: unknown, type: string): value is NodeRecord {
  return asRecord(value)?.type === type;
}

function sourcePath(filename: string, root: string): string | null {
  const filenameWithoutQuery = filename.split(/[?#]/, 1)[0] ?? '';
  if (!supportedExtension.test(filenameWithoutQuery) || filenameWithoutQuery.endsWith('.d.ts')) return null;

  const normalizedFilename = filenameWithoutQuery.split('\\').join('/');
  const normalizedRoot = root.split('\\').join('/');
  const absoluteFile = isAbsolute(normalizedFilename) ? normalizedFilename : resolve(normalizedFilename);
  const fromRoot = relative(resolve(normalizedRoot), absoluteFile);
  if (fromRoot === '' || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || fromRoot.startsWith('../') || isAbsolute(fromRoot)) return null;
  return normalize(fromRoot).split(sep).join('/').replace(/^(\.\/)+/, '');
}

function jsxIdentifierName(value: unknown): string | null {
  const record = asRecord(value);
  if (record?.type !== 'JSXIdentifier' || typeof record.name !== 'string') return null;
  return record.name;
}

function openingName(opening: NodeRecord): string | null {
  return jsxIdentifierName(opening.name);
}

function numberField(record: NodeRecord, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' ? value : null;
}

function sourceRef(opening: NodeRecord, file: string, tag: string): SourceRef | null {
  const loc = asRecord(opening.loc);
  const start = asRecord(loc?.start);
  const line = numberField(start ?? {}, 'line');
  const columnZeroBased = numberField(start ?? {}, 'column');
  if (line === null || columnZeroBased === null) return null;
  const siteId = `s_${createHash('sha256')
    .update(`${file}\u0000${line}\u0000${columnZeroBased + 1}\u0000${tag}`)
    .digest('base64url')
    .slice(0, 18)}`;
  return { siteId, file, line, column: columnZeroBased + 1, tag };
}

function existingSiteAttribute(opening: NodeRecord): { value: string | null; count: number } {
  const attributes = Array.isArray(opening.attributes) ? opening.attributes : [];
  let value: string | null = null;
  let count = 0;
  for (const attribute of attributes) {
    if (!isType(attribute, 'JSXAttribute') || jsxIdentifierName(attribute.name) !== SOURCE_ATTRIBUTE) continue;
    count += 1;
    const attributeValue = asRecord(attribute.value);
    value = attributeValue?.type === 'StringLiteral' && typeof attributeValue.value === 'string' ? attributeValue.value : null;
  }
  return { value, count };
}

function diagnostic(code: string, message: string, source: SourceRef | null): InstrumentDiagnostic {
  return {
    code,
    message,
    file: source?.file ?? null,
    line: source?.line ?? null,
    column: source?.column ?? null
  };
}

export function instrument(code: string, options: InstrumentOptions): InstrumentResult | null {
  const file = sourcePath(options.filename, options.root);
  if (options.mode === 'production' || file === null) return null;

  const ast = parse(code, {
    sourceFilename: file,
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  const editor = new MagicString(code);
  const sites: SourceRef[] = [];
  const diagnostics: InstrumentDiagnostic[] = [];

  const visit = (value: unknown, insideSvg: boolean): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, insideSvg);
      return;
    }
    const record = asRecord(value);
    if (!record) return;

    if (record.type === 'JSXElement') {
      const opening = asRecord(record.openingElement);
      const tag = opening ? openingName(opening) : null;
      const isSvg = tag === 'svg';
      const isHostElement = tag !== null && /^[a-z]/.test(tag) && !insideSvg && !isSvg;
      if (opening && tag && isHostElement) {
        const source = sourceRef(opening, file, tag);
        const start = numberField(asRecord(opening.name) ?? {}, 'end');
        if (!source || start === null) {
          diagnostics.push(diagnostic('MISSING_SOURCE_LOCATION', `Could not locate <${tag}> for ANWC instrumentation.`, source));
        } else {
          const existing = existingSiteAttribute(opening);
          if (existing.count === 0) {
            editor.appendLeft(start, ` ${SOURCE_ATTRIBUTE}="${source.siteId}"`);
            sites.push(source);
          } else if (existing.count === 1 && existing.value === source.siteId) {
            sites.push(source);
          } else {
            diagnostics.push(diagnostic('RESERVED_ATTRIBUTE_COLLISION', `<${tag}> already defines ${SOURCE_ATTRIBUTE}.`, source));
          }
        }
      }

      if (opening && Array.isArray(opening.attributes)) visit(opening.attributes, insideSvg || isSvg);
      const children = Array.isArray(record.children) ? record.children : [];
      for (const child of children) visit(child, insideSvg || isSvg);
      return;
    }

    for (const child of Object.values(record)) visit(child, insideSvg);
  };

  visit(ast.program, false);
  const output = editor.toString();
  return {
    code: output,
    map: editor.generateMap({ hires: true, source: file, includeContent: true }),
    sites,
    diagnostics
  };
}

export { SOURCE_ATTRIBUTE };
