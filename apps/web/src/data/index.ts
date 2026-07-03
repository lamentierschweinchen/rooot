/**
 * ROOOT data lane — barrel export. The composition root (main.ts,
 * coordinator-owned) picks one of these per docs/ARCHITECTURE.md's data-flow
 * diagram: LiveSource in production, ReplaySource for the replay surface
 * (first-class per docs/ARCHITECTURE.md — "judges review after the final"),
 * MockSource for local dev only.
 */
export { ReplaySource } from './ReplaySource';
export type { ReplaySourceOptions, ReplaySpeed } from './ReplaySource';
export { LiveSource } from './LiveSource';
export type { LiveSourceOptions } from './LiveSource';
export { MockSource } from './MockSource';
export { FIXTURES, lookupFixture } from './fixtureMeta';
