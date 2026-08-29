import { describe, expect, it } from 'vitest';
import { ChessGame, STARTING_FEN } from '../ChessGame';
import { getSquareName, parseSquareName } from '../utils';
import { PromotionPiece } from '../types';

const sq = (name: string) => {
  const pos = parseSquareName(name);
  if (!pos) throw new Error(`bad square ${name}`);
  return pos;
};

const PROMOTION_BY_LETTER: Record<string, PromotionPiece> = {
  q: 'queen', r: 'rook', b: 'bishop', n: 'knight',
};

/** Plays a list of `"e2e4"` (or `"e7e8n"`) style moves, asserting each is legal. */
const play = (game: ChessGame, ...moves: string[]) => {
  for (const move of moves) {
    const promotion = move.length > 4 ? PROMOTION_BY_LETTER[move[4]] : undefined;
    const played = game.makeMove(
      sq(move.slice(0, 2)),
      sq(move.slice(2, 4)),
      promotion,
    );
    expect(played, `expected ${move} to be legal`).not.toBeNull();
  }
};

const destinations = (game: ChessGame, from: string) =>
  game.getLegalDestinations(sq(from)).map(getSquareName).sort();

describe('castling', () => {
  const CASTLE_READY = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';

  it('offers both castles when the path is clear', () => {
    const game = new ChessGame(CASTLE_READY);
    expect(destinations(game, 'e1')).toEqual(['c1', 'd1', 'f1', 'g1']);
  });

  it('moves the rook to the far side of the king when castling kingside', () => {
    const game = new ChessGame(CASTLE_READY);
    play(game, 'e1g1');
    expect(game.getPieceAt(sq('g1'))?.type).toBe('king');
    expect(game.getPieceAt(sq('f1'))?.type).toBe('rook');
    expect(game.getPieceAt(sq('h1'))).toBeNull();
    expect(game.getPieceAt(sq('e1'))).toBeNull();
  });

  it('places the rook on d1 when castling queenside', () => {
    const game = new ChessGame(CASTLE_READY);
    play(game, 'e1c1');
    expect(game.getPieceAt(sq('c1'))?.type).toBe('king');
    expect(game.getPieceAt(sq('d1'))?.type).toBe('rook');
    expect(game.getPieceAt(sq('a1'))).toBeNull();
  });

  it('refuses to castle out of check', () => {
    // The rook on e8 checks along the e-file, so neither castle is available.
    const game = new ChessGame('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(game.isKingInCheck('white')).toBe(true);
    expect(destinations(game, 'e1')).not.toContain('g1');
    expect(destinations(game, 'e1')).not.toContain('c1');
  });

  it('refuses to castle through an attacked square', () => {
    // A black rook on f8 covers f1, the square the king must cross.
    const game = new ChessGame('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(destinations(game, 'e1')).toContain('c1');
    expect(destinations(game, 'e1')).not.toContain('g1');
  });

  it('refuses to castle into an attacked square', () => {
    const game = new ChessGame('6r1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(destinations(game, 'e1')).not.toContain('g1');
  });

  it('allows queenside castling when only b1 is attacked', () => {
    // The rook on b8 hits b1, which the king never touches - this is legal.
    const game = new ChessGame('1r6/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(destinations(game, 'e1')).toContain('c1');
  });

  it('refuses to castle with a piece in the way', () => {
    const game = new ChessGame('r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1');
    expect(destinations(game, 'e1')).not.toContain('g1');
    expect(destinations(game, 'e1')).toContain('c1');
  });

  it('requires b1 to be empty for queenside castling', () => {
    const game = new ChessGame('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1');
    expect(destinations(game, 'e1')).not.toContain('c1');
    expect(destinations(game, 'e1')).toContain('g1');
  });

  it('forfeits both rights once the king moves', () => {
    const game = new ChessGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    play(game, 'e1f1', 'e8f8', 'f1e1', 'f8e8');
    expect(destinations(game, 'e1')).not.toContain('g1');
    expect(destinations(game, 'e1')).not.toContain('c1');
    expect(game.toFEN()).toContain(' w - ');
  });

  it('forfeits one side when that rook moves', () => {
    const game = new ChessGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    play(game, 'h1g1', 'a8b8', 'g1h1', 'b8a8');
    expect(destinations(game, 'e1')).not.toContain('g1');
    expect(destinations(game, 'e1')).toContain('c1');
  });

  it('forfeits the right when the rook is captured on its home square', () => {
    // The b2 bishop takes the h8 rook, which must strip Black's kingside right.
    const game = new ChessGame('r3k2r/8/8/8/8/8/1B6/R3K2R w KQkq - 0 1');
    play(game, 'b2h8');
    expect(game.toFEN()).toContain(' KQq ');
    expect(destinations(game, 'e8')).not.toContain('g8');
    expect(destinations(game, 'e8')).toContain('c8');
  });

  it('records castling in algebraic notation', () => {
    const game = new ChessGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    play(game, 'e1g1', 'e8c8');
    expect(game.getMoveHistory().map((m) => m.san)).toEqual(['O-O', 'O-O-O']);
  });

  it('can be taken back cleanly', () => {
    const game = new ChessGame('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
    const before = game.toFEN();
    play(game, 'e1g1');
    game.undoLastMove();
    expect(game.toFEN()).toBe(before);
    expect(game.getPieceAt(sq('h1'))?.type).toBe('rook');
    expect(game.getMoveHistory()).toHaveLength(0);
  });
});

describe('en passant', () => {
  it('advertises the capture square after a double push', () => {
    const game = new ChessGame(STARTING_FEN);
    play(game, 'e2e4');
    expect(game.toFEN()).toContain(' b KQkq e3 ');
  });

  it('captures the passing pawn on the square it skipped', () => {
    const game = new ChessGame('8/8/8/8/4pP2/8/8/K6k b - f3 0 1');
    play(game, 'e4f3');
    expect(game.getPieceAt(sq('f3'))?.color).toBe('black');
    expect(game.getPieceAt(sq('f4'))).toBeNull();
  });

  it('expires after one move', () => {
    const game = new ChessGame('7k/8/8/8/4p3/8/5P2/K7 w - - 0 1');
    play(game, 'f2f4');
    expect(destinations(game, 'e4')).toContain('f3');
    play(game, 'h8h7', 'a1a2');
    expect(destinations(game, 'e4')).not.toContain('f3');
  });

  it('is illegal when it exposes the king along the rank', () => {
    // Both pawns leave the fifth rank, unmasking the white rook onto the king.
    const game = new ChessGame('8/8/8/K2pP2r/8/8/8/7k w - d6 0 1');
    expect(destinations(game, 'e5')).toEqual(['e6']);
  });

  it('restores the captured pawn when undone', () => {
    const game = new ChessGame('8/8/8/8/4pP2/8/8/K6k b - f3 0 1');
    const before = game.toFEN();
    play(game, 'e4f3');
    game.undoLastMove();
    expect(game.toFEN()).toBe(before);
    expect(game.getPieceAt(sq('f4'))?.type).toBe('pawn');
  });

  it('writes the capture in algebraic notation', () => {
    const game = new ChessGame('8/8/8/8/4pP2/8/8/K6k b - f3 0 1');
    play(game, 'e4f3');
    expect(game.getMoveHistory()[0].san).toBe('exf3');
  });
});

describe('promotion', () => {
  const READY = '8/4P3/8/8/8/8/8/K6k w - - 0 1';

  it('offers all four promotion pieces', () => {
    const game = new ChessGame(READY);
    const promotions = game
      .getLegalMovesFrom(sq('e7'))
      .filter((m) => m.to.row === 0)
      .map((m) => m.promotion);
    expect(promotions.sort()).toEqual(['bishop', 'knight', 'queen', 'rook']);
    expect(game.requiresPromotion(sq('e7'), sq('e8'))).toBe(true);
  });

  it('honours under-promotion', () => {
    const game = new ChessGame(READY);
    play(game, 'e7e8n');
    expect(game.getPieceAt(sq('e8'))?.type).toBe('knight');
    expect(game.getMoveHistory()[0].san).toBe('e8=N');
  });

  it('defaults to a queen when no choice is supplied', () => {
    const game = new ChessGame(READY);
    game.makeMove(sq('e7'), sq('e8'));
    expect(game.getPieceAt(sq('e8'))?.type).toBe('queen');
  });

  it('restores the pawn when undone', () => {
    const game = new ChessGame(READY);
    play(game, 'e7e8q');
    game.undoLastMove();
    expect(game.getPieceAt(sq('e7'))?.type).toBe('pawn');
    expect(game.toFEN()).toBe(READY);
  });

  it('handles a promotion that is also a capture', () => {
    const game = new ChessGame('3r4/4P3/8/8/8/8/8/K6k w - - 0 1');
    play(game, 'e7d8r');
    expect(game.getPieceAt(sq('d8'))?.type).toBe('rook');
    expect(game.getMoveHistory()[0].san).toBe('exd8=R');
  });

  it('does not flag a non-promoting move', () => {
    const game = new ChessGame('8/8/4P3/8/8/8/8/K6k w - - 0 1');
    expect(game.requiresPromotion(sq('e6'), sq('e7'))).toBe(false);
  });
});

describe('check, checkmate and stalemate', () => {
  it('detects the back rank mate', () => {
    const game = new ChessGame('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    play(game, 'a1a8');
    const state = game.getGameState();
    expect(state.isCheckmate).toBe(true);
    expect(state.gameOver).toBe(true);
    expect(state.winner).toBe('white');
    expect(state.moveHistory[0].san).toBe('Ra8#');
  });

  it("detects fool's mate", () => {
    const game = new ChessGame(STARTING_FEN);
    play(game, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(game.getGameState().isCheckmate).toBe(true);
    expect(game.getGameState().winner).toBe('black');
  });

  it('detects stalemate', () => {
    const game = new ChessGame('7k/5Q2/8/8/8/8/8/K7 w - - 0 1');
    play(game, 'f7g6');
    const state = game.getGameState();
    expect(state.isStalemate).toBe(true);
    expect(state.isDraw).toBe(true);
    expect(state.isCheckmate).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.result).toBe('stalemate');
  });

  it('forces the player out of check', () => {
    const game = new ChessGame('4r3/8/8/8/8/8/4P3/4K3 w - - 0 1');
    expect(game.isKingInCheck('white')).toBe(false);
    const pinned = new ChessGame('4r3/8/8/8/8/8/4B3/4K3 w - - 0 1');
    // The bishop is pinned along the e-file and may not step aside.
    expect(destinations(pinned, 'e2')).toEqual([]);
  });

  it('rejects a move that leaves the king in check', () => {
    const game = new ChessGame('4r3/8/8/8/8/8/4B3/4K3 w - - 0 1');
    expect(game.makeMove(sq('e2'), sq('d3'))).toBeNull();
  });

  it('rejects moving an empty square or the wrong colour', () => {
    const game = new ChessGame(STARTING_FEN);
    expect(game.makeMove(sq('e4'), sq('e5'))).toBeNull();
    expect(game.makeMove(sq('e7'), sq('e5'))).toBeNull();
  });

  it('refuses any move once the game is over', () => {
    const game = new ChessGame('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    play(game, 'a1a8');
    expect(game.makeMove(sq('g1'), sq('g2'))).toBeNull();
  });
});

describe('draws', () => {
  it('calls king versus king a draw', () => {
    expect(new ChessGame('7k/8/8/8/8/8/8/K7 w - - 0 1').hasInsufficientMaterial()).toBe(true);
  });

  it('calls king and bishop versus king a draw', () => {
    expect(new ChessGame('7k/8/8/8/8/8/8/KB6 w - - 0 1').hasInsufficientMaterial()).toBe(true);
  });

  it('calls king and knight versus king a draw', () => {
    expect(new ChessGame('7k/8/8/8/8/8/8/KN6 w - - 0 1').hasInsufficientMaterial()).toBe(true);
  });

  it('calls same-colour bishops a draw but opposite colours playable', () => {
    // Bishops on c1 and f8 are both dark squares.
    expect(new ChessGame('5b1k/8/8/8/8/8/8/K1B5 w - - 0 1').hasInsufficientMaterial()).toBe(true);
    // c1 (dark) against c8 (light).
    expect(new ChessGame('2b4k/8/8/8/8/8/8/K1B5 w - - 0 1').hasInsufficientMaterial()).toBe(false);
  });

  it('does not call two knights or a lone pawn a draw', () => {
    expect(new ChessGame('7k/8/8/8/8/8/8/KNN5 w - - 0 1').hasInsufficientMaterial()).toBe(false);
    expect(new ChessGame('7k/8/8/8/8/8/P7/K7 w - - 0 1').hasInsufficientMaterial()).toBe(false);
  });

  it('declares a draw on the fifty-move rule', () => {
    const game = new ChessGame('7k/8/8/8/8/8/R7/K7 w - - 99 60');
    expect(game.getGameState().gameOver).toBe(false);
    play(game, 'a2b2');
    const state = game.getGameState();
    expect(state.halfmoveClock).toBe(100);
    expect(state.result).toBe('fifty-move');
    expect(state.isDraw).toBe(true);
  });

  it('resets the halfmove clock on a pawn move or capture', () => {
    const game = new ChessGame('7k/8/8/8/8/8/P6r/K7 w - - 40 60');
    play(game, 'a2a3');
    expect(game.getGameState().halfmoveClock).toBe(0);
  });

  it('declares a draw on the third repetition', () => {
    const game = new ChessGame('7k/8/8/8/8/8/8/K1N2N2 w - - 0 1');
    play(game, 'c1b3', 'h8g8', 'b3c1', 'g8h8'); // second occurrence
    expect(game.getGameState().isDraw).toBe(false);
    play(game, 'c1b3', 'h8g8', 'b3c1', 'g8h8'); // third occurrence
    const state = game.getGameState();
    expect(state.result).toBe('threefold-repetition');
    expect(state.isDraw).toBe(true);
  });

  it('stops counting a repetition that was taken back', () => {
    const game = new ChessGame('7k/8/8/8/8/8/8/K1N2N2 w - - 0 1');
    play(game, 'c1b3', 'h8g8', 'b3c1', 'g8h8');
    play(game, 'c1b3', 'h8g8', 'b3c1', 'g8h8');
    expect(game.getGameState().isDraw).toBe(true);
    game.undoLastMove();
    expect(game.getGameState().isDraw).toBe(false);
  });
});

describe('FEN round tripping', () => {
  it('reproduces the starting position', () => {
    expect(new ChessGame(STARTING_FEN).toFEN()).toBe(STARTING_FEN);
  });

  it('survives a round trip through a complex position', () => {
    const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
    expect(new ChessGame(fen).toFEN()).toBe(fen);
  });

  it('tracks move numbers', () => {
    const game = new ChessGame(STARTING_FEN);
    play(game, 'e2e4', 'e7e5', 'g1f3');
    const state = game.getGameState();
    expect(state.fullmoveNumber).toBe(2);
    expect(state.currentPlayer).toBe('black');
  });

  it('rejects nonsense', () => {
    expect(() => new ChessGame('not a fen')).toThrow();
    expect(() => new ChessGame('8/8/8 w - - 0 1')).toThrow();
  });
});

describe('state isolation', () => {
  it('hands out snapshots that later moves cannot mutate', () => {
    const game = new ChessGame(STARTING_FEN);
    const snapshot = game.getGameState();
    play(game, 'e2e4');
    expect(snapshot.board[6][4]?.type).toBe('pawn');
    expect(snapshot.moveHistory).toHaveLength(0);
    expect(snapshot.currentPlayer).toBe('white');
  });

  it('keeps a clone independent of the original', () => {
    const game = new ChessGame(STARTING_FEN);
    const clone = game.clone();
    play(clone, 'e2e4', 'e7e5');
    expect(game.toFEN()).toBe(STARTING_FEN);
    expect(game.getMoveHistory()).toHaveLength(0);
  });
});

describe('algebraic notation', () => {
  it('disambiguates by file, rank and full square', () => {
    const byFile = new ChessGame('7k/8/8/8/8/8/8/K1N3N1 w - - 0 1');
    play(byFile, 'c1e2');
    expect(byFile.getMoveHistory()[0].san).toBe('Nce2');

    const byRank = new ChessGame('7k/8/8/8/R7/8/8/R6K w - - 0 1');
    play(byRank, 'a1a3');
    expect(byRank.getMoveHistory()[0].san).toBe('R1a3');

    const bySquare = new ChessGame('8/1k6/8/8/Q6Q/8/8/Q6K w - - 0 1');
    play(bySquare, 'a4d4');
    expect(bySquare.getMoveHistory()[0].san).toBe('Qa4d4');
  });

  it('marks captures and checks', () => {
    const game = new ChessGame('4k3/8/8/8/8/8/r7/4K2R w K - 0 1');
    play(game, 'h1h8');
    expect(game.getMoveHistory()[0].san).toBe('Rh8+');
  });

  it('writes a plain pawn move without a piece letter', () => {
    const game = new ChessGame(STARTING_FEN);
    play(game, 'e2e4', 'd7d5', 'e4d5');
    expect(game.getMoveHistory().map((m) => m.san)).toEqual(['e4', 'd5', 'exd5']);
  });
});

describe('square helpers', () => {
  it('maps board coordinates to names and back', () => {
    expect(getSquareName({ row: 7, col: 4 })).toBe('e1');
    expect(getSquareName({ row: 0, col: 0 })).toBe('a8');
    expect(parseSquareName('e1')).toEqual({ row: 7, col: 4 });
    expect(parseSquareName('h8')).toEqual({ row: 0, col: 7 });
    expect(parseSquareName('z9')).toBeNull();
    expect(parseSquareName('e')).toBeNull();
  });
});
