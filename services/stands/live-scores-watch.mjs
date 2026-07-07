// Watches the ACTUAL TxLINE scores feed for our fixtures — polls the scores snapshot
// and taps the scores stream. EXITS (re-invoking the agent) the instant real scores
// appear (GameState leaves "scheduled", or a status/score/clock/possession envelope
// arrives). Until then it heartbeats. This is the source of truth for "is it live yet."
import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('../../.secrets/txline-token.json', 'utf8'));
const BASE = 'https://txline-dev.txodds.com';
const H = { Authorization: `Bearer ${t.jwt}`, 'X-Api-Token': t.apiToken, Accept: 'application/json' };
const FIXTURES = process.argv.slice(2).length ? process.argv.slice(2) : ['18202701', '18202783'];
const t0 = Date.now();
const MAX_MS = 20 * 60 * 1000;

function bye(reason) { console.log(`\n=== SCORES WATCH EXIT: ${reason} ===`); process.exit(0); }
const liveActions = new Set(['status', 'kickoff', 'goal', 'possession', 'safe_possession', 'attack_possession',
  'danger_possession', 'high_danger_possession', 'shot', 'corner', 'free_kick', 'throw_in', 'yellow_card',
  'red_card', 'substitution', 'injury', 'penalty_outcome', 'var', 'additional_time', 'score_adjustment']);

async function poll() {
  for (const fid of FIXTURES) {
    try {
      const r = await fetch(`${BASE}/api/scores/snapshot/${fid}`, { headers: H });
      if (!r.ok) continue;
      const arr = await r.json();
      if (!Array.isArray(arr)) continue;
      const gs = arr[0] && arr[0].GameState;
      const liveEnv = arr.find((e) => liveActions.has(e.Action) || (e.Clock && e.Clock.Seconds > 0) || e.Score);
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[+${el}s] ${fid}: envelopes=${arr.length} GameState=${gs} actions=[${[...new Set(arr.map((e) => e.Action))].join(',')}]`);
      if ((gs && gs !== 'scheduled') || liveEnv) {
        bye(`SCORES LIVE for ${fid} — GameState=${gs}, sample=${JSON.stringify(liveEnv || arr[arr.length - 1]).slice(0, 200)}`);
      }
    } catch (e) { console.log('poll err', e.message); }
  }
  if (Date.now() - t0 > MAX_MS) bye('re-arm window elapsed (20 min) — scores still not live, re-check');
}

await poll();
setInterval(poll, 25000);
