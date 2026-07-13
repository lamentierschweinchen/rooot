/**
 * A tiny, dependency-free branded cover PNG (press-black → poppy diagonal gradient — the ROOOT
 * palette). Ported from the local `makeCoverPng` duplicated in mint/scripts/proveRelicMint.ts and
 * mint/scripts/proveOwnedMint.ts (kept there too — this is the shared copy new callers should use;
 * see progress.md's Task 1 note: factor out once a 3rd real usage appears. The live claim-mint
 * path, seat/mint-scarf.ts, is that 3rd usage).
 *
 * HONEST LABEL: a real per-match/per-fan scarf illustration is the relics lane's job
 * (archive/src-spa-frozen/apps/web/src/relics/renderPoster.ts renders the real client-side art) — this generic branded
 * gradient is a placeholder cover for the on-chain asset until that's wired server-side. It is
 * never asserted to be anything more.
 */
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

/**
 * press-black #1A1A18 (26,26,24) → poppy #C8504D (200,80,77), RGBA, node zlib only — no image
 * deps. Deterministic (same bytes every call) — cheap enough to regenerate per mint.
 */
export function makeScarfCoverPng(w = 640, h = 640): Uint8Array {
  const from = { r: 0x1a, g: 0x1a, b: 0x18 };
  const to = { r: 0xc8, g: 0x50, b: 0x4d };
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2; // diagonal
      raw[o++] = Math.round(from.r + (to.r - from.r) * t);
      raw[o++] = Math.round(from.g + (to.g - from.g) * t);
      raw[o++] = Math.round(from.b + (to.b - from.b) * t);
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return Uint8Array.from(png);
}
