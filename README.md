# ROOOT

**The world's most beautiful and fun fan experience — on your phone, and on-chain forever.**

Connect with the game, the stats, the people you're watching with, and the fans all
across the world. A floodlit night pitch where the market's live belief moves as a
golden tide; root your side, cheer into your end, call your moments (receipts, on-chain),
and keep what you all just lived — the match woven into a scarf, your story pressed
into a pin.

Built for the TxODDS World Cup Hackathon on Solana (Consumer & Fan Experiences track).
Data: TxLINE (real-time World Cup odds + scores, Merkle-anchored on Solana).
Sibling of [STRATA](https://exploresolana.art). `rooot.club`.

- The game is the game — ROOOT never competes with the match for attention.
- The market has the number; the crowd has the roar. Never blended, nothing invented.
- No wager, no token. Free. Every root anchored in a root.

## Dev

```
npm install
npm run dev        # the stage
npm run spike      # TxLINE devnet auth walk (writes .secrets/, probes to docs/txline/probe/)
npm run record -- --url <sse-url> --out fixtures/<match>.jsonl [--header "..."]
```

`.secrets/` is gitignored: keypairs and tokens never enter history.
