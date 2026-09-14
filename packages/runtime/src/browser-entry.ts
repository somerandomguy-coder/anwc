import { capture, configureRuntime } from './index.js';

declare global {
  interface Window {
    __ANWC__?: {
      version: string;
      capture: typeof capture;
      sourceForSite: (siteId: string) => null;
    };
  }
}

configureRuntime({ runtimeVersion: '0.0.0' });
window.__ANWC__ = { version: '0.1', capture, sourceForSite: () => null };
