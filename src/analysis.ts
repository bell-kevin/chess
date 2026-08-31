import { ChessBot } from './ChessBot';
import { ChessGame } from './ChessGame';
import { BotAnalysis } from './botProtocol';
import { Move } from './types';

/**
 * Works out the strongest move in a position and packages it for win mode.
 *
 * Shared by the worker and the in-process fallback so a hint means the same
 * thing either way. A fresh bot per call keeps two overlapping analyses from
 * sharing one search state.
 */
export const analysePosition = (
  fen: string,
  timeBudgetMs?: number,
): BotAnalysis | null => {
  const game = new ChessGame(fen, { trackRepetition: false });
  const analysis = new ChessBot('very-hard').analyse(game, { timeBudgetMs });
  if (!analysis) return null;

  return {
    move: {
      from: analysis.move.from,
      to: analysis.move.to,
      promotion: analysis.move.promotion,
    },
    score: analysis.score,
    mateIn: analysis.mateIn,
    depth: analysis.depth,
    line: toNotation(fen, analysis.line),
  };
};

/**
 * Replays the line on a scratch game, which is what puts notation on each move.
 * A line that stops replaying is truncated rather than trusted: the tail of a
 * principal variation is only as good as the search that produced it.
 */
const toNotation = (fen: string, line: Move[]): string[] => {
  const game = new ChessGame(fen, { trackRepetition: false });
  const notation: string[] = [];

  for (const move of line) {
    const played = game.makeMove(move.from, move.to, move.promotion);
    if (!played?.san) break;
    notation.push(played.san);
  }

  return notation;
};
