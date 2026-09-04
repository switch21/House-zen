/**
 * HOUSE-ZEN — Resilient lazy loading.
 *
 * A production SPA deployed with immutable /assets/* caching has one classic
 * failure mode: a tab holding a stale index.html (open before a redeploy, or
 * restored from bfcache) requests chunk filenames that no longer exist. The
 * SPA rewrite answers with index.html (200, text/html), the dynamic import
 * throws a SyntaxError ("Unexpected token '<'"), and without protection the
 * whole React tree unmounts → white screen.
 *
 * lazyRetry() wraps every route-level dynamic import:
 *  1st failure → one automatic reload to pick up the fresh deploy,
 *  2nd failure → rethrow to the route ErrorBoundary (visible fallback UI).
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_FLAG = 'hz:chunk-retry';

export function lazyRetry<T extends { default: ComponentType<unknown> }>(
  factory: () => Promise<T>,
): LazyExoticComponent<T['default']> {
  return lazy(async () => {
    const alreadyRetried = sessionStorage.getItem(RELOAD_FLAG) === '1';
    try {
      const mod = await factory();
      if (alreadyRetried) sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      if (!alreadyRetried && typeof window !== 'undefined') {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        // Unreachable in practice — the page navigates away synchronously.
        return { default: () => null } as unknown as T;
      }
      throw err;
    }
  });
}

