import { describe, expect, it } from 'vitest';
import { ChessGame, STARTING_FEN } from '../ChessGame';

/**
 * Perft ("performance test") counts the leaf nodes of the legal move tree to a
 * given depth. The reference numbers below are the published values from the
 * Chess Programming Wiki. They are unforgiving: a single mishandled castling
 * right, en passant pin or promotion case shifts the count immediately.
 */
describe('perft', () => {
  const cases: { name: string; fen: string; expected: number[] }[] = [
    {
      name: 'initial position',
      fen: STARTING_FEN,
      expected: [1, 20, 400, 8902, 197281],
    },
    {
      name: 'Kiwipete (castling, pins, promotions)',
      fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      expected: [1, 48, 2039, 97862],
    },
    {
      name: 'position 3 (en passant and rook endings)',
      fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
      expected: [1, 14, 191, 2812, 43238],
    },
    {
      name: 'position 4 (promotion heavy)',
      fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
      expected: [1, 6, 264, 9467],
    },
    {
      name: 'position 4 mirrored',
      fen: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1',
      expected: [1, 6, 264, 9467],
    },
    {
      name: 'position 5 (tricky castling rights)',
      fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
      expected: [1, 44, 1486, 62379],
    },
    {
      name: 'position 6',
      fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
      expected: [1, 46, 2079],
    },
  ];

  for (const { name, fen, expected } of cases) {
    it(`matches reference counts for ${name}`, () => {
      const game = new ChessGame(fen, { trackRepetition: false });
      expected.forEach((nodes, depth) => {
        expect(game.perft(depth), `depth ${depth}`).toBe(nodes);
      });
    });
  }

  it('leaves the position untouched after a full perft walk', () => {
    const game = new ChessGame(
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
      { trackRepetition: false },
    );
    const before = game.toFEN();
    game.perft(3);
    expect(game.toFEN()).toBe(before);
  });
});
