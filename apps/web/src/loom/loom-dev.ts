/**
 * ROOOT — THE LOOM · dev entry. Mounts the living loom harness on the page.
 * (loom lane; verification-only; loaded by apps/web/loom-dev.html.)
 */
import { boot } from './harness';

boot(document.getElementById('loom-root') as HTMLElement);
