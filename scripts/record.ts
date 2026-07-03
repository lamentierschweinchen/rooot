/**
 * ROOOT recorder — captures a TxLINE SSE stream to a JSONL fixture.
 * Every live match we record becomes a replay fixture: the judges' demo,
 * the "missed the match" surface, and our dev loop all feed on these.
 *
 * Usage:
 *   npx tsx scripts/record.ts --url <sse-url> --out fixtures/<name>.jsonl \
 *     [--header "Authorization: Bearer <jwt>"] [--header "X-Api-Token: <tok>"]
 *
 * Each line: { receivedAtMs, event, data } — data kept as raw string so the
 * fixture is a faithful transcript, parsed only at replay time.
 */
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface Args { url: string; out: string; headers: Record<string, string> }

function parseArgs(): Args {
  const a = process.argv.slice(2);
  const headers: Record<string, string> = {};
  let url = '', out = '';
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v === '--url') url = a[++i] ?? '';
    else if (v === '--out') out = a[++i] ?? '';
    else if (v === '--header') {
      const h = a[++i] ?? '';
      const idx = h.indexOf(':');
      if (idx > 0) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    } else if (v === '--token-file') {
      // secrets stay out of argv/ps: read { jwt, apiToken } from the file in-process
      const p = a[++i] ?? '';
      const t = JSON.parse(readFileSync(p, 'utf8')) as { jwt: string; apiToken: string };
      headers['Authorization'] = `Bearer ${t.jwt}`;
      headers['X-Api-Token'] = t.apiToken;
    }
  }
  if (!url || !out) {
    console.error('need --url and --out');
    process.exit(1);
  }
  return { url, out, headers };
}

async function main() {
  const { url, out, headers } = parseArgs();
  mkdirSync(dirname(out), { recursive: true });
  const sink = createWriteStream(out, { flags: 'a' });
  let lines = 0;
  let backoffMs = 1000;

  const write = (event: string, data: string) => {
    sink.write(JSON.stringify({ receivedAtMs: Date.now(), event, data }) + '\n');
    lines++;
    if (lines % 50 === 0) console.log(`[record] ${lines} events → ${out}`);
  };

  process.on('SIGINT', () => {
    console.log(`\n[record] closing after ${lines} events.`);
    sink.end(() => process.exit(0));
  });

  // reconnect loop — a live feed WILL drop; design for it from the start
  for (;;) {
    try {
      console.log(`[record] connecting ${url}`);
      const res = await fetch(url, { headers: { Accept: 'text/event-stream', ...headers } });
      if (!res.ok || !res.body) {
        console.error(`[record] HTTP ${res.status} ${res.statusText}; body: ${(await res.text()).slice(0, 300)}`);
        throw new Error(`http ${res.status}`);
      }
      write('__meta', JSON.stringify({ connectedAt: new Date().toISOString(), url, status: res.status }));
      backoffMs = 1000;

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let event = 'message';
      let dataLines: string[] = [];

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).replace(/\r$/, '');
          buf = buf.slice(nl + 1);
          if (line === '') {
            if (dataLines.length) write(event, dataLines.join('\n'));
            event = 'message';
            dataLines = [];
          } else if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
          // comments (:) and id:/retry: ignored for the transcript
        }
      }
      console.warn('[record] stream ended; reconnecting');
    } catch (err) {
      console.warn(`[record] ${String(err)}; retry in ${backoffMs}ms`);
      write('__disconnect', String(err));
      await new Promise((r) => setTimeout(r, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 30_000);
    }
  }
}

main();
