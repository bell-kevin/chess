import { Position, Piece, PieceColor, PieceType, Board } from './types';

/**
 * Both colours render with the filled (black) glyphs and are told apart by
 * fill/stroke colour. The outline glyphs (\u2654-\u2659) are visually much
 * lighter than their filled counterparts, so mixing the two sets makes white
 * pieces look thin and washed out on a light square.
 *
 * Every glyph is followed by U+FE0E, the text presentation selector. Without it
 * Windows draws the pawn from its colour emoji font, which ignores `color` and
 * renders both sides in the same shade.
 */
export const PIECE_GLYPH: Record<PieceType, string> = {
  king: '\u265A\uFE0E',
  queen: '\u265B\uFE0E',
  rook: '\u265C\uFE0E',
  bishop: '\u265D\uFE0E',
  knight: '\u265E\uFE0E',
  pawn: '\u265F\uFE0E',
};

export const PIECE_NAMES: Record<PieceType, string> = {
  king: 'king',
  queen: 'queen',
  rook: 'rook',
  bishop: 'bishop',
  knight: 'knight',
  pawn: 'pawn',
};

export const getPieceGlyph = (piece: Piece): string => PIECE_GLYPH[piece.type];

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export const isValidPosition = (pos: Position): boolean =>
  pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 8;

export const isSamePosition = (a: Position, b: Position): boolean =>
  a.row === b.row && a.col === b.col;

/** Row 0 is rank 8, so a8 (0 + 0) is light and a1 (7 + 0) is dark. */
export const getSquareColor = (row: number, col: number): 'light' | 'dark' =>
  (row + col) % 2 === 0 ? 'light' : 'dark';

export const getOppositeColor = (color: PieceColor): PieceColor =>
  color === 'white' ? 'black' : 'white';

export const copyBoard = (board: Board): Board =>
  board.map((row) => row.map((piece) => (piece ? { ...piece } : null)));

export const createEmptyBoard = (): Board =>
  Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));

/** `{ row: 7, col: 4 }` -> `"e1"`. */
export const getSquareName = (pos: Position): string =>
  `${FILES[pos.col]}${8 - pos.row}`;

/** `"e1"` -> `{ row: 7, col: 4 }`, or `null` if it is not a square name. */
export const parseSquareName = (name: string): Position | null => {
  if (name.length !== 2) return null;
  const col = FILES.indexOf(name[0].toLowerCase() as (typeof FILES)[number]);
  const rank = Number(name[1]);
  if (col === -1 || !Number.isInteger(rank) || rank < 1 || rank > 8) return null;
  return { row: 8 - rank, col };
};

export const PIECE_VALUES: Record<PieceType, number> = {
  pawn: 100,
  knight: 320,
  bishop: 330,
  rook: 500,
  queen: 900,
  king: 0,
};

