import { useCallback, useRef, useState } from 'react';
import { GameState, Move, Position } from './types';
import {
  FILES,
  getPieceGlyph,
  getSquareColor,
  getSquareName,
  isSamePosition,
  PIECE_NAMES,
} from './utils';

interface ChessBoardProps {
  gameState: GameState;
  selected: Position | null;
  candidateMoves: Move[];
  /** Blocks input while the bot is thinking or a dialog is open. */
  disabled: boolean;
  /** The move win mode is recommending, drawn as an arrow. */
  hint: { from: Position; to: Position } | null;
  onSquareClick: (position: Position) => void;
}

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

const HINT_COLOUR = '#34d399';
/** Traced under the arrow so it stays readable over both shades of square. */
const HINT_CASING = 'rgba(15, 23, 42, 0.55)';

/**
 * Win mode's arrow, from the piece to the square it should go to. Drawn in
 * board coordinates - one unit per square - so it scales with the board and
 * never has to measure the DOM.
 */
const HintArrow = ({ from, to }: { from: Position; to: Position }) => {
  const start = { x: from.col + 0.5, y: from.row + 0.5 };
  const end = { x: to.col + 0.5, y: to.row + 0.5 };
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const step = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };

  // Started clear of the piece and stopped short of the target square's centre,
  // so the arrow points at what is on it rather than covering it.
  const tail = { x: start.x + step.x * 0.36, y: start.y + step.y * 0.36 };
  const head = { x: end.x - step.x * 0.24, y: end.y - step.y * 0.24 };

  /**
   * Both heads point at the same spot, because `refX` lines the tip of the
   * path up with the end of the line it is on. A marker is measured in stroke
   * widths, so the casing's size is scaled down by the same amount its stroke
   * is wider: what shows of it is a rim, not a second arrowhead.
   */
  const arrowhead = (id: string, fill: string, size: number) => (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth={size}
      markerHeight={size}
      orient="auto"
    >
      <path d="M0,1 L9,5 L0,9 Z" fill={fill} />
    </marker>
  );

  return (
    <svg
      viewBox="0 0 8 8"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    >
      <defs>
        {/* A marker resolves `currentColor` where it is defined, not where it is
            used, so the two arrowheads carry their colours outright. */}
        {arrowhead('win-hint-casing', HINT_CASING, 2.5)}
        {arrowhead('win-hint-head', HINT_COLOUR, 3.6)}
      </defs>
      <line
        x1={tail.x}
        y1={tail.y}
        x2={head.x}
        y2={head.y}
        stroke={HINT_CASING}
        strokeWidth={0.26}
        strokeLinecap="round"
        markerEnd="url(#win-hint-casing)"
      />
      <line
        x1={tail.x}
        y1={tail.y}
        x2={head.x}
        y2={head.y}
        stroke={HINT_COLOUR}
        strokeWidth={0.15}
        strokeLinecap="round"
        markerEnd="url(#win-hint-head)"
      />
    </svg>
  );
};

export const ChessBoard = ({
  gameState,
  selected,
  candidateMoves,
  disabled,
  hint,
  onSquareClick,
}: ChessBoardProps) => {
  const { board, lastMove, isCheck, currentPlayer } = gameState;

  /**
   * Roving tabindex: the board is one tab stop and the arrow keys move within
   * it, rather than making the player press Tab sixty-four times.
   */
  const [focusedSquare, setFocusedSquare] = useState<Position>({ row: 7, col: 4 });
  const boardRef = useRef<HTMLDivElement>(null);

  const focusSquare = useCallback((position: Position) => {
    setFocusedSquare(position);
    const selector = `[data-square="${getSquareName(position)}"]`;
    boardRef.current?.querySelector<HTMLButtonElement>(selector)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, position: Position) => {
      const deltas: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault();
      focusSquare({
        row: Math.min(7, Math.max(0, position.row + delta[0])),
        col: Math.min(7, Math.max(0, position.col + delta[1])),
      });
    },
    [focusSquare],
  );

  const renderSquare = (row: number, col: number) => {
    const position: Position = { row, col };
    const piece = board[row][col];
    const squareName = getSquareName(position);

    const isSelected = selected !== null && isSamePosition(selected, position);
    const move = candidateMoves.find((candidate) =>
      isSamePosition(candidate.to, position),
    );
    // An en passant target square is empty but is still a capture.
    const isCapture = Boolean(move?.capturedPiece);
    const isLastMove =
      lastMove !== null &&
      (isSamePosition(lastMove.from, position) || isSamePosition(lastMove.to, position));
    const isCheckedKing =
      isCheck && piece?.type === 'king' && piece.color === currentPlayer;
    const isHintFrom = hint !== null && isSamePosition(hint.from, position);
    const isHintTo = hint !== null && isSamePosition(hint.to, position);

    // Exactly one background class is emitted: two competing Tailwind
    // backgrounds resolve by stylesheet order, not by the order they are
    // concatenated here, which made the check highlight unreliable.
    // The hint outranks the last move: it is the thing the player turned win
    // mode on to see, and the arrow between the two squares tints them anyway.
    let background: string;
    if (isCheckedKing) background = 'bg-rose-400/90';
    else if (isSelected) background = 'bg-sky-400/70';
    else if (isHintFrom || isHintTo) background = 'bg-emerald-400/55';
    else if (isLastMove) background = 'bg-amber-300/50';
    else background = getSquareColor(row, col) === 'light' ? 'bg-[#eeddc0]' : 'bg-[#b48761]';

    // Win mode is no use to a screen reader as an arrow, so both of its
    // squares say what they are.
    const hintLabel = isHintFrom
      ? ', the move to play'
      : isHintTo
        ? ', where the recommended move goes'
        : '';
    const label = piece
      ? `${squareName}, ${piece.color} ${PIECE_NAMES[piece.type]}${
          move ? (isCapture ? ', capture' : ', move here') : ''
        }${hintLabel}`
      : `${squareName}, empty${move ? ', move here' : ''}${hintLabel}`;

    const isFocusTarget = isSamePosition(focusedSquare, position);

    return (
      <button
        key={squareName}
        type="button"
        data-square={squareName}
        // Only the focused square is tabbable, so the board is one tab stop.
        tabIndex={isFocusTarget ? 0 : -1}
        aria-label={label}
        aria-pressed={isSelected}
        disabled={disabled}
        onClick={() => {
          setFocusedSquare(position);
          onSquareClick(position);
        }}
        onKeyDown={(event) => handleKeyDown(event, position)}
        className={`board-square relative flex aspect-square w-full items-center justify-center ${background} ${
          move ? (isCapture ? 'capture-hint' : 'move-hint') : isHintTo ? 'win-hint-to' : ''
        } ${disabled ? 'cursor-default' : 'cursor-pointer'} transition-colors duration-150`}
      >
        {/* Coordinates live inside the board so nothing can overflow the frame. */}
        {col === 0 && (
          <span
            aria-hidden="true"
            className={`board-coordinate pointer-events-none absolute left-[6%] top-[4%] font-semibold ${
              getSquareColor(row, col) === 'light' ? 'text-[#b48761]' : 'text-[#eeddc0]'
            }`}
          >
            {8 - row}
          </span>
        )}
        {row === 7 && (
          <span
            aria-hidden="true"
            className={`board-coordinate pointer-events-none absolute bottom-[4%] right-[6%] font-semibold ${
              getSquareColor(row, col) === 'light' ? 'text-[#b48761]' : 'text-[#eeddc0]'
            }`}
          >
            {FILES[col]}
          </span>
        )}

        {piece && (
          <span
            aria-hidden="true"
            className={`pointer-events-none relative select-none ${
              piece.color === 'white'
                ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,.55),0_0_1px_rgba(0,0,0,.9)]'
                : 'text-slate-900 [text-shadow:0_1px_1px_rgba(255,255,255,.35)]'
            }`}
          >
            {/* Both colours use the filled glyph: the outline set renders far
                lighter and washes out on a light square. */}
            {getPieceGlyph(piece)}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      ref={boardRef}
      role="grid"
      aria-label="Chess board"
      className="board-frame relative grid grid-cols-8 overflow-hidden rounded-lg shadow-2xl ring-4 ring-[#7a5230]"
    >
      {ROWS.map((row) => ROWS.map((col) => renderSquare(row, col)))}
      {hint && <HintArrow from={hint.from} to={hint.to} />}
    </div>
  );
};
