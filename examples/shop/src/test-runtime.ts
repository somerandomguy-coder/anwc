import { capture, configureRuntime } from '@anwc/runtime';

declare global {
  interface Window {
    __ANWC_TEST__?: { capture: typeof capture; configureRuntime: typeof configureRuntime };
  }
}

window.__ANWC_TEST__ = { capture, configureRuntime };
