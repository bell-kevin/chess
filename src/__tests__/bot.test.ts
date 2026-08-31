import { describe, expect, it } from 'vitest';
import { ChessGame, STARTING_FEN } from '../ChessGame';
import { ChessBot } from '../ChessBot';
import { getSquareName, parseSquareName } from '../utils';
import { Difficulty, Move } from '../types';

const sq = (name: string) => {
  const pos = parseSquareName(name);
  if (!pos) throw new Error(`bad square ${name}`);
  return pos;
};

const describeMove = (move: Move | null) =>
  move ? `${getSquareName(move.from)}${getSquareName(move.to)}` : 'none';

/** Deterministic stand-in for Math.random so difficulty tests do not flake. */
const fixedRandom = (value: number) => () => value;

const ALL_DIFFICULTIES: Difficulty[] = [
  'very-easy',
  'easy',
  'casual',
  'medium',
  'hard',
  'very-hard',
];

describe('bot tactics', () => {
  it('plays the back rank mate in one', () => {
    const game = new ChessGame('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const bot = new ChessBot('hard', { random: fixedRandom(0) });
    expect(describeMove(bot.findBestMove(game))).toBe('a1a8');
  });

  it('finds a queen mate in one', () => {
    const game = new ChessGame('7k/6Q1/6K1/8/8/8/8/8 w - - 0 1');
    const bot = new ChessBot('hard', { random: fixedRandom(0) });
    const move = bot.findBestMove(game);
    game.makeMove(move!.from, move!.to, move!.promotion);
    expect(game.getGameState().isCheckmate).toBe(true);
  });

  it('takes a hanging queen', () => {
    // Black rook on d8 can capture the undefended white queen on d4.
    const game = new ChessGame('3r3k/8/8/8/3Q4/8/8/6K1 b - - 0 1');
    const bot = new ChessBot('medium', { random: fixedRandom(0.99) });
    expect(describeMove(bot.findBestMove(game))).toBe('d8d4');
  });

  it('does not hang its own queen for a pawn', () => {
    // Qxb7 wins a pawn but drops the queen to the rook on b8.
    const game = new ChessGame('1r5k/1p6/8/8/8/8/6PP/Q5K1 w - - 0 1');
    const bot = new ChessBot('hard', { random: fixedRandom(0) });
    const move = bot.findBestMove(game);
    expect(describeMove(move)).not.toBe('a1b7');
  });

  it('sees the recapture that a one-ply search misses', () => {
    // The same trap as above, at the level that first has a ply to spare for
    // it: easy evaluates straight after Qxb7 and likes the free pawn, while
    // casual searches Black's reply and finds Rxb7.
    const game = new ChessGame('1r5k/1p6/8/8/8/8/6PP/Q5K1 w - - 0 1');
    // 0.99 clears the blunder roll, so this exercises the search itself.
    const bot = new ChessBot('casual', { random: fixedRandom(0.99) });
    expect(describeMove(bot.findBestMove(game))).not.toBe('a1b7');
  });

  it('recaptures instead of evaluating mid-trade', () => {
    // Quiescence matters here: after Rxd5 White must see Black recapturing.
    const game = new ChessGame('3r3k/8/8/3q4/8/8/8/3R2K1 w - - 0 1');
    const bot = new ChessBot('hard', { random: fixedRandom(0) });
    expect(describeMove(bot.findBestMove(game))).toBe('d1d5');
  });

  it('escapes check rather than ignoring it', () => {
    const game = new ChessGame('7k/8/8/8/8/8/6r1/K7 w - - 0 1');
    const bot = new ChessBot('medium', { random: fixedRandom(0) });
    const move = bot.findBestMove(game);
    expect(move).not.toBeNull();
    game.makeMove(move!.from, move!.to, move!.promotion);
    expect(game.isKingInCheck('white')).toBe(false);
  });

  it('promotes with the capture that also wins a rook', () => {
    const game = new ChessGame('3r4/4P3/8/8/8/8/8/K6k w - - 0 1');
    const bot = new ChessBot('hard', { random: fixedRandom(0) });
    const move = bot.findBestMove(game);
    expect(describeMove(move)).toBe('e7d8');
    expect(move?.promotion).toBe('queen');
  });

  it('never under-promotes into an immediate draw', () => {
    // Promoting to a bishop or knight here leaves K+minor v K, a dead position.
    const game = new ChessGame('8/4P3/8/8/8/8/8/K6k w - - 0 1');
    const bot = new ChessBot('hard', { random: fixedRandom(0) });
    const move = bot.findBestMove(game);
    expect(move?.promotion).not.toBe('bishop');
    expect(move?.promotion).not.toBe('knight');
  });
});

describe('bot safety', () => {
  it.each(ALL_DIFFICULTIES)('returns only legal moves at %s', (difficulty) => {
    const game = new ChessGame(
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    );
    const bot = new ChessBot(difficulty, { timeBudgetMs: 200 });
    const legal = game.getLegalMoves('white');
    for (let i = 0; i < 8; i++) {
      const move = bot.findBestMove(game);
      expect(move).not.toBeNull();
      expect(
        legal.some(
          (candidate) =>
            candidate.from.row === move!.from.row &&
            candidate.from.col === move!.from.col &&
            candidate.to.row === move!.to.row &&
            candidate.to.col === move!.to.col &&
            candidate.promotion === move!.promotion,
        ),
        `${describeMove(move)} should be legal`,
      ).toBe(true);
    }
  });

  it.each(ALL_DIFFICULTIES)('leaves the game untouched at %s', (difficulty) => {
    const game = new ChessGame(STARTING_FEN);
    game.makeMove(sq('e2'), sq('e4'));
    game.makeMove(sq('e7'), sq('e5'));
    const fenBefore = game.toFEN();
    const historyBefore = game.getMoveHistory().length;

    const bot = new ChessBot(difficulty, { timeBudgetMs: 200 });
    bot.findBestMove(game);

    expect(game.toFEN()).toBe(fenBefore);
    // The old engine appended every simulated move to the real history.
    expect(game.getMoveHistory()).toHaveLength(historyBefore);
  });

  it('returns null when there are no legal moves', () => {
    const mated = new ChessGame('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1');
    expect(new ChessBot('hard').findBestMove(mated)).toBeNull();
  });

  it('respects its time budget', () => {
    const game = new ChessGame(
      'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    );
    const bot = new ChessBot('very-hard', { timeBudgetMs: 300 });
    const started = Date.now();
    expect(bot.findBestMove(game)).not.toBeNull();
    // Generous headroom: the deadline is only sampled every 1024 nodes.
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it('plays a whole game against itself without an illegal move', () => {
    const game = new ChessGame(STARTING_FEN);
    const white = new ChessBot('medium', { timeBudgetMs: 60 });
    const black = new ChessBot('easy', { timeBudgetMs: 60 });

    for (let ply = 0; ply < 120 && !game.getGameState().gameOver; ply++) {
      const bot = game.getCurrentPlayer() === 'white' ? white : black;
      const move = bot.findBestMove(game);
      expect(move, `no move at ply ${ply}`).not.toBeNull();
      const played = game.makeMove(move!.from, move!.to, move!.promotion);
      expect(played, `illegal move ${describeMove(move)} at ply ${ply}`).not.toBeNull();
    }

    // Every position reached must still round trip through FEN.
    expect(() => new ChessGame(game.toFEN())).not.toThrow();
  });
});

describe('evaluation', () => {
  it('is symmetric between the two colours', () => {
    const bot = new ChessBot('medium');
    const game = new ChessGame(
      'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1',
    );
    expect(bot.evaluate('white', game)).toBe(-bot.evaluate('black', game));
  });

  it('scores the side with an extra rook higher', () => {
    const bot = new ChessBot('medium');
    const game = new ChessGame('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(bot.evaluate('white', game)).toBeGreaterThan(400);
  });

  it('is level in the starting position', () => {
    const bot = new ChessBot('medium');
    expect(bot.evaluate('white', new ChessGame(STARTING_FEN))).toBe(0);
  });
});
