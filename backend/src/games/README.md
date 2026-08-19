# Game modules

Empty on purpose. The foundation (auth, deposit/withdraw, escrow, dashboard) is
built first; games come in a separate pass. `Gambling_Docs/04-Games-Index.md`
holds the master list and assigns each game its number — Game 01 (`coin-flip`)
is designed in `Gambling_Docs/Games/G01-Coin-Flip.md` but not yet coded.

## Adding a game

```
backend/src/games/<game-id>/
├── index.ts        # default-exports a GameModule
├── manifest.ts     # id, name, mode, player counts, status
├── engine.ts       # pure game rules — no I/O, easy to unit test
└── socket.ts       # realtime handlers (optional)
```

Register it in `registry.ts`, then build the matching UI in
`frontend/src/games/<game-id>/`.

## The one hard rule

A game gets money behaviour **only** from the escrow adapter:

```ts
import { escrow } from '../../escrow/index.js';

const matchId = await escrow.createMatch({ gameId: 'coin-flip', mode: 'solo_vs_house' });
await escrow.lockBalance(userId, stakeLamports, matchId);
// ... game rules decide the outcome ...
await escrow.settleMatch(matchId, [userId], [payoutLamports]);
```

A game must **never** import `User`, `LedgerEntry`, `Match`, or `treasury`, and
must never write a balance field itself. That is what makes the treasury model
swappable for an on-chain program later without rewriting any game
(`00-Overview.md`, principle #2).

## Fee handling

- `mode: 'pooled'` — `settleMatch` takes 5% off the pot. Pass relative weights:
  `settleMatch(id, [alice, bob], [1, 1])` splits the post-fee pot evenly.
- `mode: 'solo_vs_house'` — bake the 5% edge into your odds table and pass
  **absolute lamport payouts**: `settleMatch(id, [alice], [1_900_000_000])`.
  `settleMatch` charges no additional fee in this mode.
