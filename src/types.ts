export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
export type PieceColor = 'white' | 'black';
export type Difficulty = 'very-easy' | 'easy' | 'medium' | 'hard' | 'very-hard';

export interface Position {
  row: number;
  col: number;
}

export interface Piece {
  type: PieceType;
  color: PieceColor;
  hasMoved?: boolean;
}

export interface Move {
  from: Position;
  to: Position;
  piece: Piece;
  capturedPiece?: Piece;
  castling?: 'kingside' | 'queenside';
  enPassant?: boolean;
  promotion?: PieceType;
}

export interface GameState {
  board: (Piece | null)[][];
  currentPlayer: PieceColor;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  gameOver: boolean;
  selectedSquare: Position | null;
  legalMoves: Position[];
  moveHistory: Move[];
  difficulty: Difficulty;
}