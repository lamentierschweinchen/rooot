/**
 * ROOOT app — barrel. The coordinator wires the shell from main.ts:
 *   import { createApp } from './app';
 *   createApp({ mount: document.body, source, fixture, crowd });
 */
export { createApp } from './createApp';
export type { CreateAppOptions, RooootApp } from './createApp';
