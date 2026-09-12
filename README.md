# PoCow

**English** · [中文](README.zh-CN.md)

A browser version of *PoCow*, an original 3 + 2 card game. Pure front-end, no server required:

- **Solo** — one player against 2–7 AI opponents
- **Online** — create a room, share the 5-character room code, and play with 3–8 people at one table (AI can fill empty seats). Built on peer-to-peer WebRTC (PeerJS): the host's browser is the authoritative server, a disconnected player is taken over by AI, and the room closes when the host leaves

🎮 Play online: https://harrychenn.github.io/PoCow/

The interface is available in **English and Chinese**. The language buttons sit in the top-right corner of the home screen and in the table header; your choice is remembered locally. On a first visit the language follows your browser (Chinese browsers get Chinese, everyone else gets English).

## Running

```bash
npm install
npm run dev    # open the printed local address to play
npm test       # engine rule unit tests
npm run build  # emit static files to dist/
```

## How to Play

- 54 cards (2 Jokers). J / Q / K / Joker each count 10 points, A counts 1. A Joker has no suit.
- 5 cards per player, 3–8 players.
- Three ideas drive everything: **power** decides who wins (only power is compared); **multiplier** comes from bottom-card bonuses and never affects who wins; **payout = power × multiplier** is what each loser pays the winner.

### Swap Phase (free-for-all, no turn order)

Everyone acts **at the same time**: swap with the deck, offer a swap to any idle opponent, or finish. A pair mid-swap is locked to each other (shown as "swapping") and cannot act with anyone else; several pairs can swap in parallel. Once everyone finishes, the arrange phase begins.

1. **Swap with the deck** — only before you have swapped with any opponent: discard one named card and draw one from the deck. Afterwards you are **out of player swaps** for the round: you cannot offer one, and nobody can pick you. Conversely, **once you swap with a player (whether you offered or accepted), neither of you may use the deck again**.
2. **Swap with an opponent** — pick an opponent and offer; they may decline. If they accept, **each of you blind-picks one card from the other hand** (you cannot see the faces, you pick by position; both chosen positions flash briefly before the trade). **The same pair may swap at most twice per round** (whoever offers); a decline costs no swap, but you cannot offer to that player again.

### Hands and Scoring

Your 5 cards split into a 3-card **bottom** (sets the multiplier) and a 2-card **kicker** (sets the power). After swapping comes the **arrange phase**: everyone picks their own 3 bottom cards and confirms — entirely by hand, so **a bad split can leave you with no niu**. Building a good hand is the whole point. Special wins need no split and apply automatically. Once everyone submits, hands are revealed.

**Bottom multiplier** (3 cards summing to a multiple of 10 make a *niu*)

| Bottom bonus | Multiplier |
| --- | --- |
| Flush | ×2 |
| Straight (Q+K+Joker counts as one) | ×2 |
| Trips (**always a niu**, no need to sum to a multiple of 10) | ×3 |

Bonuses on the same 3 cards multiply together (a 3-card straight flush = ×4).

Trips are a niu on their own: otherwise 3 × rank is only a multiple of 10 when the rank counts 10, so trips of A–9 could never make a niu and could never collect the ×3.

**Hand bonus — Joker Bomb**

Holding **both Jokers** multiplies your final payout by **×3**, wherever they sit — bottom or kicker. It **stacks** with the bottom multiplier, and it applies even with no niu:

| Hand | Payout |
| --- | --- |
| Flush bottom (×2) + both Jokers in the kicker (power 7) | 7 × 2 × 3 = 42 |
| Both Jokers + K as bottom (sum 30), kicker 4+6 (power 5) | 5 × 3 = 15 |
| No niu, but holding both Jokers | 1 × 3 = 3 |

A Joker Bomb is only 2 cards, so it is never a bottom on its own: to use it in the bottom you still need a third card that brings the bottom to a multiple of 10 (only a 10-point card does that).

**Kicker power** (units digit of the 2-card sum)

| Kicker | Power |
| --- | --- |
| 1–6 | 1 |
| 7 / 8 / 9 | 2 / 3 / 4 |
| 0 (Niu Niu) | 5 |
| Pair / two Jokers | 7 |

**Special wins** (all 5 cards, no niu needed, no kicker on top)

| Hand | Power |
| --- | --- |
| Five-card straight | 8 |
| Five-card flush | 9 |
| All face cards (J/Q/K/Joker) | 10 |
| Ten Small (total ≤ 10) | 11 |
| Bomb (four of a kind) | 12 |

A special win pays special power × bottom multiplier:

- Multiple specials at once **add** their power (straight flush = 8+9); only the highest one is used when comparing hands.
- The multiplier is the **single best 3-card subset** of the 5 cards; bonuses only multiply when the same subset satisfies them and **cannot be mixed across subsets**.
  - A five-card straight contains a 3-card straight → 8×2 = 16
  - A bomb contains trips → 12×3 = 36
  - A straight flush → (8+9)×2×2 = **68**
- The Joker Bomb ×3 is a hand bonus, so it multiplies on top of the subset multiplier (all face cards with both Jokers → 10 × 2 × 3 = 60).

### Comparing and Scoring

- Only **power** is compared: special win > ordinary kicker > no niu. The multiplier never affects who wins, only what is paid.
- No niu (no bottom summing to a multiple of 10) still takes part in the comparison and loses to any hand with a niu.
- On equal power (including everyone with no niu), the 5 cards are compared by **Texas Hold'em** rules (a Joker is the highest single card).
- **Winner takes all**: every loser pays the winner's payout (power × multiplier); winning with no niu pays 1 point; tied winners split the pot.

## Project Layout

```
src/engine/   Pure TypeScript game engine (UI-agnostic, fully unit-tested)
  cards.ts    Card model, points, deck
  scoring.ts  Bottom multiplier, kicker power, special wins, best split
  compare.ts  Power comparison + Texas Hold'em tie-break
  game.ts     Deal → swap → showdown → settle state machine (pure functions)
  ai.ts       AI heuristics
src/net/      Online layer (host-authoritative P2P)
  protocol.ts Message and action types
  view.ts     GameState → per-seat redacted view (others' hands masked, pick by index)
  apply.ts    Action validation and application (shared by solo/host/remote, anti-cheat)
  host.ts     Host session: create room, handshake, AI seats, broadcast, AI takeover
  client.ts   Joiner session
src/ui/       React components (GameTable is shared by solo and online play)
src/i18n/     English/Chinese copy and localization
  dict.ts     Copy dictionary (en is the source of keys; zh is type-checked against it)
  index.tsx   Language context, switcher, interpolation
  format.ts   Structured hands/log events → text in the current language
```

The engine never produces display text: hand labels and log events are emitted as structured data and rendered per viewer, so in an online game each player reads the table in their own language regardless of the host's.
