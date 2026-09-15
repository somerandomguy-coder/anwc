import { instrument } from '@anwc/compiler';
import type { InstrumentResult, SourceRef } from '@anwc/protocol';
import type { IndexHtmlTransformContext, Plugin, ResolvedConfig, ViteDevServer } from 'vite';

const VIRTUAL_ID = 'virtual:anwc-runtime';
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

type SourceMap = { version: number; mappings: string; names: string[]; sources: string[]; sourcesContent?: string[] };

export type AnwcPluginOptions = {
  enabled?: boolean;
  sourceRoot?: string;
  runtimeVersion?: string;
};

function runtimeModule(sourcesByModule: Record<string, Record<string, SourceRef>>, runtimeVersion: string): string {
  return `import { capture, configureRuntime } from '@anwc/runtime';
const sourcesByModule = ${JSON.stringify(sourcesByModule)};
const manifest = {};
const pendingSources = window.__ANWC_PENDING_SOURCES__ ??= {};
const registerSources = (moduleId, sources) => {
  for (const siteId of Object.keys(sourcesByModule[moduleId] ?? {})) delete manifest[siteId];
  sourcesByModule[moduleId] = sources;
  Object.assign(manifest, sources);
  pendingSources[moduleId] = sources;
};
for (const [moduleId, sources] of Object.entries(sourcesByModule)) registerSources(moduleId, sources);
for (const [moduleId, sources] of Object.entries(pendingSources)) if (!(moduleId in sourcesByModule)) registerSources(moduleId, sources);
const sourceForSite = (siteId) => manifest[siteId] ?? null;
configureRuntime({ sourceLookup: sourceForSite, runtimeVersion: ${JSON.stringify(runtimeVersion)} });
window.__ANWC__ = { version: '0.1', capture, sourceForSite, registerSources };
if (import.meta.hot) import.meta.hot.accept();`;
}

export function anwc(options: AnwcPluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let active = false;
  let server: ViteDevServer | undefined;
  const sitesByModule = new Map<string, SourceRef[]>();

  const moduleManifest = (): Record<string, Record<string, SourceRef>> => {
    const result: Record<string, Record<string, SourceRef>> = {};
    for (const [id, sites] of sitesByModule) result[id] = Object.fromEntries(sites.map((site) => [site.siteId, site]));
    return result;
  };

  const updateModuleSites = (id: string, code: string): InstrumentResult | null => {
    if (!config || !active) return null;
    const transformed = instrument(code, { filename: id, root: options.sourceRoot ?? config.root, mode: 'development' });
    if (!transformed) return null;
    sitesByModule.set(id, transformed.sites);
    return transformed;
  };

  const invalidateRuntimeModule = (): void => {
    const module = server?.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
    if (module) server!.moduleGraph.invalidateModule(module);
  };

  return {
    name: 'anwc',
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
      active = options.enabled ?? resolved.command === 'serve';
    },
    configureServer(nextServer) {
      server = nextServer;
    },
    resolveId(id) {
      return active && id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id) {
      return active && id === RESOLVED_VIRTUAL_ID ? runtimeModule(moduleManifest(), options.runtimeVersion ?? '0.0.0') : null;
    },
    transform(code, id) {
      const transformed = updateModuleSites(id, code);
      if (transformed === null) return null;
      const sourceRecords = Object.fromEntries(transformed.sites.map((site) => [site.siteId, site]));
      const registration = `\n;(() => { const sources = ${JSON.stringify(sourceRecords)}; const pending = window.__ANWC_PENDING_SOURCES__ ??= {}; pending[${JSON.stringify(id)}] = sources; window.__ANWC__?.registerSources?.(${JSON.stringify(id)}, sources); })();`;
      return { code: `${transformed.code}${registration}`, map: transformed.map as SourceMap };
    },
    transformIndexHtml(_html, _context: IndexHtmlTransformContext) {
      if (!active) return undefined;
      return [{ tag: 'script', attrs: { type: 'module', src: `/@id/${VIRTUAL_ID}` }, injectTo: 'head-prepend' }];
    },
    async handleHotUpdate(context) {
      if (!active) return;
      const code = await context.read();
      const transformed = updateModuleSites(context.file, code);
      if (transformed !== null) {
        invalidateRuntimeModule();
        const runtimeModule = server?.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
        if (runtimeModule) return [...context.modules, runtimeModule];
      }
    }
  };
}
