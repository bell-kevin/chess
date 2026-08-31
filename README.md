<a name="readme-top"></a>

# Chess

A chess game against an AI opponent, built with React, TypeScript and Vite.

Play it here: <https://bell-kevin.github.io/chess/>

## Rules

The engine implements the full rules of chess:

- **Castling**, both sides, with every restriction: the king and rook must be
  unmoved, the squares between them empty, and the king may not castle out of,
  through, or into check.
- **En passant**, including the case where the capture is illegal because it
  would expose the king along the rank.
- **Promotion** to a queen, rook, bishop or knight — under-promotion is offered
  rather than assumed.
- **Draws**: stalemate, insufficient material, the fifty-move rule and
  threefold repetition.

Move generation is verified against the standard [perft][perft] node counts to
depth 5 from six reference positions, which is what makes the castling and en
passant corner cases trustworthy rather than merely untested.

[perft]: https://www.chessprogramming.org/Perft_Results

## The AI

The bot searches with **negamax and alpha-beta pruning**, driven by iterative
deepening under a wall-clock budget so it always answers promptly:

- **Quiescence search** extends along captures and promotions, so the bot never
  evaluates a position in the middle of a trade and hands you a piece.
- **Move ordering** by most-valuable-victim / least-valuable-attacker, plus
  killer moves, which is what makes the pruning effective.
- **Evaluation** combines material, piece-square tables (with a separate king
  table for the endgame), the bishop pair, and doubled, isolated and passed
  pawns.
- **Mate scores** fold in the distance to mate, so the bot prefers the quickest
  win and the most stubborn defence.

The search runs in a **Web Worker**, so even the deepest setting never freezes
the board — which matters most on a phone.

### Difficulty levels

| Level | Behaviour |
| --- | --- |
| Very Easy | Random legal moves — for learning how the pieces move |
| Easy | One-ply search, picks loosely among reasonable moves and blunders often |
| Casual | Two-ply search without quiescence — sees the reply to its own move, but not the trade that follows |
| Medium | Two-ply search with quiescence and a little randomness |
| Hard | Four-ply search; punishes hanging pieces |
| Very Hard | Six-ply iterative deepening; will not give away material |

## Playing

The board is keyboard accessible: it is a single tab stop, the arrow keys move
between squares, and Enter selects or plays. Every square carries a label for
screen readers. The layout adapts to portrait phones, landscape phones, tablets
and desktop.

## Development

```sh
npm install
npm run dev        # start the dev server
npm test           # rules, perft and bot tests
npm run typecheck
npm run lint
npm run build
```

## Deployment

Every push to `main` builds the app and publishes it to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which gates the
deploy on `typecheck` and the test suite. The site then updates on its own; no
`gh-pages` branch is involved. A fork needs **Settings → Pages → Build and
deployment** set to **GitHub Actions** once before its first deploy.

The Vite build uses `base: './'`, so the same `dist/` works whether it is served
from the project path (`/chess/`), a domain root, or a custom domain. To serve
it from a custom domain, point the DNS at GitHub Pages and set the domain under
**Settings → Pages**.

Play it here: https://bell-kevin.github.io/chess/

<p align="left"><a href="#readme-top">back to top</a></p>
