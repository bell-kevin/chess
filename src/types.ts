export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';
export type Difficulty = 'very-easy' | 'easy' | 'casual' | 'medium' | 'hard' | 'very-hard';

/** Pieces a pawn may promote to. A pawn may never become a king or stay a pawn. */
export type PromotionPiece = 'queen' | 'rook' | 'bishop' | 'knight';

export interface Position {
  row: number;
  col: number;
}

export interface Piece {
  type: PieceType;
  color: PieceColor;
  hasMoved: boolean;
}

export type Board = (Piece | null)[][];

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  /** The captured piece, if any. For en passant this is the pawn on `capturedAt`. */
  capturedPiece?: Piece;
  /** Square the captured piece sat on. Differs from `to` only for en passant. */
  capturedAt?: Position;
  castling?: 'kingside' | 'queenside';
  enPassant?: boolean;
  promotion?: PromotionPiece;
  /** Standard algebraic notation, filled in when the move is played. */
  san?: string;
}

export type GameResult =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient-material'
  | 'fifty-move'
  | 'threefold-repetition';

export interface CastlingRights {
  whiteKingside: boolean;
  whiteQueenside: boolean;
  blackKingside: boolean;
  blackQueenside: boolean;
}

/**
 * A pure snapshot of the rules-level position. Deliberately contains no UI
 * concerns (selection, hover, dialogs) so that the engine can be copied,
 * searched and compared without dragging view state along.
 */
export interface GameState {
  board: Board;
  currentPlayer: PieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  gameOver: boolean;
  result: GameResult | null;
  /** Winner on checkmate, `null` for any draw or an unfinished game. */
  winner: PieceColor | null;
  moveHistory: Move[];
  lastMove: Move | null;
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
}
