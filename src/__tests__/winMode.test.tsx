import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analysePosition } from '../analysis';
import { ChessBoard } from '../ChessBoard';
import { ChessGame } from '../ChessGame';
import { WinModePanel } from '../WinModePanel';
import { Position } from '../types';
import { WinHint } from '../useChessGame';
import { isSamePosition, parseSquareName } from '../utils';

/** Builds the hint the way the hook does: an analysis matched onto a legal move. */
const hintFor = (fen: string): WinHint => {
  const game = new ChessGame(fen);
  const analysis = analysePosition(fen);
  if (!analysis) throw new Error(`no analysis for ${fen}`);

  const move = game
    .getLegalMovesFrom(analysis.move.from)
    .find((candidate) => isSamePosition(candidate.to, analysis.move.to));
  if (!move) throw new Error('the analysis did not match a legal move');

  return {
    move,
    score: analysis.score,
    mateIn: analysis.mateIn,
    depth: analysis.depth,
    line: analysis.line,
  };
};

const sq = (name: string) => {
  const pos = parseSquareName(name);
  if (!pos) throw new Error(`bad square ${name}`);
  return pos;
};

const panel = (props: Partial<Parameters<typeof WinModePanel>[0]>) =>
  renderToStaticMarkup(
    <WinModePanel
      enabled
      hint={null}
      isHinting={false}
      isPlayersTurn
      gameOver={false}
      onToggle={() => {}}
      {...props}
    />,
  );

describe('win mode panel', () => {
  it('names the piece, the squares and what the move is worth', () => {
    const markup = panel({ hint: hintFor('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1') });

    expect(markup).toContain('Ra8#');
    expect(markup).toContain('Move your rook from a1 to a8');
    expect(markup).toContain('This is checkmate.');
  });

  it('says what a capture takes', () => {
    // The black rook on d8 wins the undefended queen on d4.
    const markup = panel({ hint: hintFor('3r3k/8/8/8/3Q4/8/8/6K1 b - - 0 1') });

    expect(markup).toContain('Move your rook from d8 to d4, taking the queen.');
    expect(markup).toContain('Winning');
  });

  it('is honest about a position it cannot win', () => {
    // A bare king against a queen: there is a best move, but no good news.
    const markup = panel({ hint: hintFor('3q3k/8/8/8/8/8/8/6K1 w - - 0 1') });

    expect(markup).toContain('Losing');
    expect(markup).not.toContain('Winning');
  });

  it('explains itself while it is off, and shows nothing else', () => {
    const markup = panel({ enabled: false });

    expect(markup).toContain('Off');
    expect(markup).toContain('Shows you which piece to move where');
  });

  it('waits visibly rather than showing a stale move', () => {
    expect(panel({ isHinting: true })).toContain('Finding your best move');
    expect(panel({ isPlayersTurn: false })).toContain('Waiting for the bot');
    expect(panel({ gameOver: true })).toContain('The game is over');
  });
});

describe('the hint on the board', () => {
  const board = (hint: { from: Position; to: Position } | null) =>
    renderToStaticMarkup(
      <ChessBoard
        gameState={new ChessGame().getGameState()}
        selected={null}
        candidateMoves={[]}
        disabled={false}
        hint={hint}
        onSquareClick={() => {}}
      />,
    );

  it('draws an arrow from the piece to the square it should go to', () => {
    const markup = board({ from: sq('g1'), to: sq('f3') });
    const line = /<line[^>]*x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/.exec(
      markup,
    );

    expect(line).not.toBeNull();
    const [x1, y1, x2, y2] = line!.slice(1).map(Number);
    // g1 is the seventh file and the bottom rank, f3 the sixth file and the
    // third from the bottom: the arrow has to run up and to the left of it.
    expect(x1).toBeGreaterThan(6);
    expect(x1).toBeLessThan(7);
    expect(y1).toBeGreaterThan(7);
    expect(x2).toBeLessThan(x1);
    expect(y2).toBeLessThan(y1);

    expect(markup).toContain('win-hint-to');
    expect(markup).toContain('g1, white knight, the move to play');
  });

  it('draws nothing at all when win mode has no move to show', () => {
    const markup = board(null);

    expect(markup).not.toContain('win-hint');
    expect(markup).not.toContain('<line');
  });
});
