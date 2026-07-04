/**
 * ROOOT — TEXTURE BUILDER (POSSESSION · PRESSURE · TEMPO, derived + honest).
 *
 * Pure, DOM-free, framework-free — the twin of the ledger builder. Consumes the
 * possession-spell stream (contracts/normalize.parseSpell) and the tempo-bearing
 * events, and publishes one TextureSample per match minute (contracts/texture.ts).
 *
 * POSSESSION/PRESSURE are attributed by the GAP method (verified against
 * ARG–CPV → 65/35, matching reality): the time between two consecutive spells
 * belonged to the side holding the FIRST one. A gap > MAX_GAP (a stoppage,
 * halftime) is dropped, never smeared across minutes — a dead minute reads 0/0,
 * honestly, not filled. PRESSURE weights danger/high-danger only (safe/attack
 * possession is not threat). TEMPO counts real events, never spell chatter.
 */

import type { Spell, TextureSample, TextureSnapshot } from '@contracts/texture';
import { PRESSURE_WEIGHT } from '@contracts/texture';

/** ms of spell-gap beyond which we assume a stoppage and don't attribute time. */
const MAX_GAP_SECONDS = 120;

interface MinuteAcc {
  possSecs: { home: number; away: number };
  dangerWeighted: { home: number; away: number };
  tempo: number;
  touched: boolean;
}

export class TextureBuilder {
  private minutes = new Map<number, MinuteAcc>();
  private prev: Spell | null = null;
  private maxMinute = -1;
  private version = 0;
  private subs = new Set<(s: TextureSnapshot) => void>();
  private published: TextureSnapshot = { rows: [], version: 0 };

  private acc(minute: number): MinuteAcc {
    let a = this.minutes.get(minute);
    if (!a) {
      a = { possSecs: { home: 0, away: 0 }, dangerWeighted: { home: 0, away: 0 }, tempo: 0, touched: false };
      this.minutes.set(minute, a);
      if (minute > this.maxMinute) this.maxMinute = minute;
    }
    return a;
  }

  /** feed one possession spell (parseSpell result). */
  pushSpell(spell: Spell): void {
    const prev = this.prev;
    this.prev = spell;
    if (!prev || prev.clockSeconds === null || spell.clockSeconds === null) return;
    const dt = spell.clockSeconds - prev.clockSeconds;
    if (dt <= 0 || dt > MAX_GAP_SECONDS) return; // stoppage / out of order — don't attribute
    const minute = Math.floor(prev.clockSeconds / 60);
    const a = this.acc(minute);
    a.touched = true;
    a.possSecs[prev.side] += dt;
    const w = PRESSURE_WEIGHT[prev.kind];
    if (w > 0) a.dangerWeighted[prev.side] += dt * w;
    this.republish();
  }

  /** feed one tempo-bearing event at its minute (goals/shots/corners/cards/…). */
  pushTempoAt(minute: number | null): void {
    if (minute === null || !Number.isFinite(minute)) return;
    const a = this.acc(minute);
    a.touched = true;
    a.tempo += 1;
    this.republish();
  }

  private sampleFor(minute: number, settled: boolean): TextureSample {
    const a = this.minutes.get(minute);
    if (!a || !a.touched) {
      return { minute, possession: { home: 0, away: 0 }, pressure: { home: 0, away: 0 }, tempo: 0, settled };
    }
    const pTot = a.possSecs.home + a.possSecs.away;
    const dTot = a.dangerWeighted.home + a.dangerWeighted.away;
    return {
      minute,
      possession: pTot > 0 ? { home: a.possSecs.home / pTot, away: a.possSecs.away / pTot } : { home: 0, away: 0 },
      pressure: dTot > 0 ? { home: a.dangerWeighted.home / dTot, away: a.dangerWeighted.away / dTot } : { home: 0, away: 0 },
      tempo: a.tempo,
      settled,
    };
  }

  snapshot(): TextureSnapshot {
    const rows: TextureSample[] = [];
    for (let m = 0; m <= this.maxMinute; m++) rows.push(this.sampleFor(m, m < this.maxMinute));
    return { rows, version: this.version };
  }

  subscribe(cb: (s: TextureSnapshot) => void): () => void {
    this.subs.add(cb);
    cb(this.published);
    return () => this.subs.delete(cb);
  }

  private republish(): void {
    this.version += 1;
    this.published = this.snapshot();
    for (const cb of this.subs) cb(this.published);
  }
}
