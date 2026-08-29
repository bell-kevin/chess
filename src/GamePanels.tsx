import { useEffect, useRef } from 'react';
import { Move, PieceColor, PieceType } from './types';
import { PIECE_GLYPH, PIECE_VALUES } from './utils';

/** Heavier pieces first, so a capture list reads at a glance. */
const CAPTURE_ORDER: PieceType[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

interface CapturedPiecesProps {
  moveHistory: Move[];
  /** Whose losses to show. */
  color: PieceColor;
}

/**
 * Derives both sides' losses and the running material balance from the move
 * history, so nothing extra has to be kept in sync with the board.
 */
const summariseCaptures = (moveHistory: Move[]) => {
  const lost: Record<PieceColor, PieceType[]> = { white: [], black: [] };
  for (const move of moveHistory) {
    if (move.capturedPiece) lost[move.capturedPiece.color].push(move.capturedPiece.type);
  }
  const value = (types: PieceType[]) =>
    types.reduce((total, type) => total + PIECE_VALUES[type], 0);
  return { lost, advantage: (value(lost.black) - value(lost.white)) / 100 };
};

export const CapturedPieces = ({ moveHistory, color }: CapturedPiecesProps) => {
  const { lost, advantage } = summariseCaptures(moveHistory);
  const pieces = [...lost[color]].sort(
    (a, b) => CAPTURE_ORDER.indexOf(a) - CAPTURE_ORDER.indexOf(b),
  );
  // A positive advantage favours White, so flip the sign when showing Black's.
  const lead = color === 'black' ? advantage : -advantage;

  return (
    <div className="flex min-h-6 items-center gap-1" aria-live="polite">
      <span className="sr-only">
        {pieces.length
          ? `${color} has lost: ${pieces.join(', ')}`
          : `${color} has lost no pieces`}
      </span>
      <span
        aria-hidden="true"
        className={`text-lg leading-none tracking-tighter ${
          color === 'white' ? 'text-slate-200' : 'text-slate-900'
        }`}
      >
        {pieces.map((type, index) => (
          <span key={`${type}-${index}`}>{PIECE_GLYPH[type]}</span>
        ))}
      </span>
      {lead > 0 && (
        <span className="text-xs font-semibold text-slate-400">+{lead}</span>
      )}
    </div>
  );
};

interface MoveHistoryProps {
  moveHistory: Move[];
}

/** The move list in standard algebraic notation, newest always in view. */
export const MoveHistory = ({ moveHistory }: MoveHistoryProps) => {
  const scrollRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [moveHistory.length]);

  const pairs: { number: number; white?: Move; black?: Move }[] = [];
  moveHistory.forEach((move, index) => {
    const moveNumber = Math.floor(index / 2) + 1;
    if (index % 2 === 0) pairs.push({ number: moveNumber, white: move });
    else pairs[pairs.length - 1].black = move;
  });

  return (
    <section className="flex min-h-0 flex-col" aria-label="Move history">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Moves
      </h2>
      {pairs.length === 0 ? (
        <p className="text-sm text-slate-500">No moves yet.</p>
      ) : (
        <ol
          ref={scrollRef}
          className="max-h-48 min-h-0 overflow-y-auto pr-1 font-mono text-sm text-slate-200 lg:max-h-[19rem]"
        >
          {pairs.map((pair) => (
            <li key={pair.number} className="flex gap-2 py-0.5">
              <span className="w-7 shrink-0 text-right text-slate-500">
                {pair.number}.
              </span>
              <span className="w-16 shrink-0">{pair.white?.san}</span>
              <span className="w-16 shrink-0">{pair.black?.san ?? ''}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
