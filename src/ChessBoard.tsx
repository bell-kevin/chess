import { useCallback, useEffect, useRef, useState } from 'react';
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
  onSquareClick: (position: Position) => void;
}

const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

export const ChessBoard = ({
  gameState,
  selected,
  candidateMoves,
  disabled,
  onSquareClick,
}: ChessBoardProps) => {
  const { board, lastMove, isCheck, currentPlayer } = gameState;

  /**
   * Roving tabindex: the board is one tab stop and the arrow keys move within
   * it, rather than making the player press Tab sixty-four times.
   */
  const [focusedSquare, setFocusedSquare] = useState<Position>({ row: 7, col: 4 });
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setFocusedSquare(selected);
  }, [selected]);

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

    // Exactly one background class is emitted: two competing Tailwind
    // backgrounds resolve by stylesheet order, not by the order they are
    // concatenated here, which made the check highlight unreliable.
    let background: string;
    if (isCheckedKing) background = 'bg-rose-400/90';
    else if (isSelected) background = 'bg-sky-400/70';
    else if (isLastMove) background = 'bg-amber-300/50';
    else background = getSquareColor(row, col) === 'light' ? 'bg-[#eeddc0]' : 'bg-[#b48761]';

    const label = piece
      ? `${squareName}, ${piece.color} ${PIECE_NAMES[piece.type]}${
          move ? (isCapture ? ', capture' : ', move here') : ''
        }`
      : `${squareName}, empty${move ? ', move here' : ''}`;

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
          move ? (isCapture ? 'capture-hint' : 'move-hint') : ''
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
      className="board-frame grid grid-cols-8 overflow-hidden rounded-lg shadow-2xl ring-4 ring-[#7a5230]"
    >
      {ROWS.map((row) => ROWS.map((col) => renderSquare(row, col)))}
    </div>
  );
};
