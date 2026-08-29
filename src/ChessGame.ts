import {
  Board,
  CastlingRights,
  GameResult,
  GameState,
  Move,
  Piece,
  PieceColor,
  PieceType,
  Position,
  PromotionPiece,
} from './types';
import {
  copyBoard,
  createEmptyBoard,
  FILES,
  getOppositeColor,
  getSquareName,
  isSamePosition,
  isValidPosition,
  parseSquareName,
} from './utils';

const KNIGHT_OFFSETS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
] as const;

const KING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1],
] as const;

const ROOK_DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]] as const;
const BISHOP_DIRECTIONS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

type Offsets = readonly (readonly [number, number])[];

const PROMOTION_PIECES: PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];

const FEN_TO_PIECE: Record<string, PieceType> = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
};
const PIECE_TO_FEN: Record<PieceType, string> = {
  king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', pawn: 'p',
};
const SAN_LETTER: Record<PieceType, string> = {
  king: 'K', queen: 'Q', rook: 'R', bishop: 'B', knight: 'N', pawn: '',
};

export const STARTING_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Everything needed to take a move back and restore the exact prior position. */
interface UndoRecord {
  move: Move;
  movedPiece: Piece;
  movedPieceHadMoved: boolean;
  captured: Piece | null;
  capturedAt: Position | null;
  rook: Piece | null;
  rookFrom: Position | null;
  rookTo: Position | null;
  rookHadMoved: boolean;
  castlingRights: CastlingRights;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  positionKey: string | null;
}

/**
 * A complete chess rules implementation: castling, en passant, under-promotion,
 * and every draw condition (stalemate, insufficient material, the fifty-move
 * rule and threefold repetition).
 *
 * The engine holds only the position. Selection, dialogs and other view state
 * live in the UI layer, so a `ChessGame` can be cloned and searched freely
 * without a React component observing half-applied moves.
 */
export class ChessGame {
  private board: Board;
  private currentPlayer: PieceColor;
  private castlingRights: CastlingRights;
  private enPassantTarget: Position | null;
  private halfmoveClock: number;
  private fullmoveNumber: number;

  private moveHistory: Move[] = [];
  private undoStack: UndoRecord[] = [];

  /** Cached king squares so check tests never have to scan the board. */
  private kingPositions: Record<PieceColor, Position | null> = {
    white: null,
    black: null,
  };

  /**
   * Repetition bookkeeping is skipped for search clones: it costs a board
   * serialisation per node and the extra strength is not worth it here.
   */
  private trackRepetition: boolean;
  private positionCounts = new Map<string, number>();

  private legalMoveCache: Move[] | null = null;
  private legalMoveCacheColor: PieceColor | null = null;

  constructor(fen: string = STARTING_FEN, options: { trackRepetition?: boolean } = {}) {
    this.trackRepetition = options.trackRepetition ?? true;
    const parsed = ChessGame.parseFEN(fen);
    this.board = parsed.board;
    this.currentPlayer = parsed.currentPlayer;
    this.castlingRights = parsed.castlingRights;
    this.enPassantTarget = parsed.enPassantTarget;
    this.halfmoveClock = parsed.halfmoveClock;
    this.fullmoveNumber = parsed.fullmoveNumber;
    this.refreshKingPositions();
    if (this.trackRepetition) {
      this.positionCounts.set(this.getPositionKey(), 1);
    }
  }

  // ---------------------------------------------------------------- FEN ----

  private static parseFEN(fen: string): {
    board: Board;
    currentPlayer: PieceColor;
    castlingRights: CastlingRights;
    enPassantTarget: Position | null;
    halfmoveClock: number;
    fullmoveNumber: number;
  } {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 4) throw new Error(`Invalid FEN: "${fen}"`);
    const [placement, active, castling, enPassant, halfmove, fullmove] = parts;

    const board = createEmptyBoard();
    const rows = placement.split('/');
    if (rows.length !== 8) throw new Error(`Invalid FEN board: "${placement}"`);

    rows.forEach((rowText, row) => {
      let col = 0;
      for (const char of rowText) {
        if (char >= '1' && char <= '8') {
          col += Number(char);
          continue;
        }
        const type = FEN_TO_PIECE[char.toLowerCase()];
        if (!type) throw new Error(`Invalid FEN piece: "${char}"`);
        if (col > 7) throw new Error(`Invalid FEN row: "${rowText}"`);
        const color: PieceColor = char === char.toUpperCase() ? 'white' : 'black';
        const homeRow = color === 'white' ? 7 : 0;
        const pawnRow = color === 'white' ? 6 : 1;
        // `hasMoved` is cosmetic (castling uses explicit rights) but keeping it
        // consistent with the position avoids surprising UI hints.
        const hasMoved = type === 'pawn' ? row !== pawnRow : row !== homeRow;
        board[row][col] = { type, color, hasMoved };
        col += 1;
      }
    });

    return {
      board,
      currentPlayer: active === 'b' ? 'black' : 'white',
      castlingRights: {
        whiteKingside: castling.includes('K'),
        whiteQueenside: castling.includes('Q'),
        blackKingside: castling.includes('k'),
        blackQueenside: castling.includes('q'),
      },
      enPassantTarget: enPassant === '-' ? null : parseSquareName(enPassant),
      halfmoveClock: Number(halfmove ?? 0) || 0,
      fullmoveNumber: Number(fullmove ?? 1) || 1,
    };
  }

  public toFEN(): string {
    const placement = this.board
      .map((row) => {
        let text = '';
        let empty = 0;
        for (const piece of row) {
          if (!piece) {
            empty += 1;
            continue;
          }
          if (empty > 0) {
            text += empty;
            empty = 0;
          }
          const letter = PIECE_TO_FEN[piece.type];
          text += piece.color === 'white' ? letter.toUpperCase() : letter;
        }
        return empty > 0 ? text + empty : text;
      })
      .join('/');

    const rights =
      (this.castlingRights.whiteKingside ? 'K' : '') +
      (this.castlingRights.whiteQueenside ? 'Q' : '') +
      (this.castlingRights.blackKingside ? 'k' : '') +
      (this.castlingRights.blackQueenside ? 'q' : '');

    return [
      placement,
      this.currentPlayer === 'white' ? 'w' : 'b',
      rights || '-',
      this.enPassantTarget ? getSquareName(this.enPassantTarget) : '-',
      this.halfmoveClock,
      this.fullmoveNumber,
    ].join(' ');
  }

  // -------------------------------------------------------------- state ----

  /** A deep snapshot. Callers can hold on to it without seeing later mutations. */
  public getGameState(): GameState {
    const legalMoves = this.getLegalMoves(this.currentPlayer);
    const isCheck = this.isKingInCheck(this.currentPlayer);
    const hasMoves = legalMoves.length > 0;

    const isCheckmate = isCheck && !hasMoves;
    const isStalemate = !isCheck && !hasMoves;
    const insufficient = this.hasInsufficientMaterial();
    const fiftyMove = this.halfmoveClock >= 100;
    const threefold = this.isThreefoldRepetition();
    const isDraw = isStalemate || insufficient || fiftyMove || threefold;

    let result: GameResult | null = null;
    if (isCheckmate) result = 'checkmate';
    else if (isStalemate) result = 'stalemate';
    else if (insufficient) result = 'insufficient-material';
    else if (fiftyMove) result = 'fifty-move';
    else if (threefold) result = 'threefold-repetition';

    return {
      board: copyBoard(this.board),
      currentPlayer: this.currentPlayer,
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw,
      gameOver: isCheckmate || isDraw,
      result,
      winner: isCheckmate ? getOppositeColor(this.currentPlayer) : null,
      moveHistory: this.moveHistory.map((move) => ({ ...move })),
      lastMove: this.moveHistory.length
        ? { ...this.moveHistory[this.moveHistory.length - 1] }
        : null,
      castlingRights: { ...this.castlingRights },
      enPassantTarget: this.enPassantTarget ? { ...this.enPassantTarget } : null,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
    };
  }

  public getCurrentPlayer(): PieceColor {
    return this.currentPlayer;
  }

  public getPieceAt(pos: Position): Piece | null {
    if (!isValidPosition(pos)) return null;
    const piece = this.board[pos.row][pos.col];
    return piece ? { ...piece } : null;
  }

  public getMoveHistory(): Move[] {
    return this.moveHistory.map((move) => ({ ...move }));
  }

  public getHalfmoveClock(): number {
    return this.halfmoveClock;
  }

  /**
   * Uncopied access to a square, for the search hot path where cloning a piece
   * per lookup is measurable. Treat the result as read-only.
   */
  public readSquare(row: number, col: number): Piece | null {
    return this.board[row][col];
  }

  public clone(options: { trackRepetition?: boolean } = {}): ChessGame {
    const copy = new ChessGame(this.toFEN(), {
      trackRepetition: options.trackRepetition ?? false,
    });
    copy.moveHistory = this.moveHistory.map((move) => ({ ...move }));
    if (copy.trackRepetition) {
      copy.positionCounts = new Map(this.positionCounts);
    }
    return copy;
  }

  public reset(fen: string = STARTING_FEN): void {
    const parsed = ChessGame.parseFEN(fen);
    this.board = parsed.board;
    this.currentPlayer = parsed.currentPlayer;
    this.castlingRights = parsed.castlingRights;
    this.enPassantTarget = parsed.enPassantTarget;
    this.halfmoveClock = parsed.halfmoveClock;
    this.fullmoveNumber = parsed.fullmoveNumber;
    this.moveHistory = [];
    this.undoStack = [];
    this.positionCounts = new Map();
    this.invalidateCache();
    this.refreshKingPositions();
    if (this.trackRepetition) {
      this.positionCounts.set(this.getPositionKey(), 1);
    }
  }

  private invalidateCache(): void {
    this.legalMoveCache = null;
    this.legalMoveCacheColor = null;
  }

  private refreshKingPositions(): void {
    this.kingPositions = { white: null, black: null };
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece?.type === 'king') this.kingPositions[piece.color] = { row, col };
      }
    }
  }

  // ------------------------------------------------------- attack tests ----

  /**
   * Ray-casts outwards from `pos` instead of generating every enemy move, which
   * turns the hot path of legality checking from O(pieces x moves) into a fixed
   * handful of lookups.
   */
  public isSquareAttacked(pos: Position, byColor: PieceColor): boolean {
    const { row, col } = pos;

    // Pawns. White pawns move towards row 0, so they attack from row + 1.
    const pawnRow = byColor === 'white' ? row + 1 : row - 1;
    if (pawnRow >= 0 && pawnRow < 8) {
      for (const dc of [-1, 1]) {
        const c = col + dc;
        if (c < 0 || c > 7) continue;
        const piece = this.board[pawnRow][c];
        if (piece && piece.color === byColor && piece.type === 'pawn') return true;
      }
    }

    for (const [dr, dc] of KNIGHT_OFFSETS) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const piece = this.board[r][c];
      if (piece && piece.color === byColor && piece.type === 'knight') return true;
    }

    for (const [dr, dc] of KING_OFFSETS) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r > 7 || c < 0 || c > 7) continue;
      const piece = this.board[r][c];
      if (piece && piece.color === byColor && piece.type === 'king') return true;
    }

    for (const [dr, dc] of ROOK_DIRECTIONS) {
      for (let i = 1; i < 8; i++) {
        const r = row + i * dr;
        const c = col + i * dc;
        if (r < 0 || r > 7 || c < 0 || c > 7) break;
        const piece = this.board[r][c];
        if (!piece) continue;
        if (piece.color === byColor && (piece.type === 'rook' || piece.type === 'queen')) {
          return true;
        }
        break;
      }
    }

    for (const [dr, dc] of BISHOP_DIRECTIONS) {
      for (let i = 1; i < 8; i++) {
        const r = row + i * dr;
        const c = col + i * dc;
        if (r < 0 || r > 7 || c < 0 || c > 7) break;
        const piece = this.board[r][c];
        if (!piece) continue;
        if (piece.color === byColor && (piece.type === 'bishop' || piece.type === 'queen')) {
          return true;
        }
        break;
      }
    }

    return false;
  }

  public isKingInCheck(color: PieceColor): boolean {
    const kingPos = this.kingPositions[color];
    // A position with no king only arises in tests and contrived FENs.
    if (!kingPos) return false;
    return this.isSquareAttacked(kingPos, getOppositeColor(color));
  }

  // --------------------------------------------------- move generation ----

  public getLegalMoves(color: PieceColor = this.currentPlayer): Move[] {
    if (this.legalMoveCache && this.legalMoveCacheColor === color) {
      return this.legalMoveCache;
    }

    const legal: Move[] = [];
    for (const move of this.generatePseudoLegalMoves(color)) {
      this.applyMove(move);
      const leavesKingInCheck = this.isKingInCheck(color);
      this.revertMove();
      if (!leavesKingInCheck) legal.push(move);
    }

    this.legalMoveCache = legal;
    this.legalMoveCacheColor = color;
    return legal;
  }

  /** Legal moves for the piece standing on `from`. */
  public getLegalMovesFrom(from: Position): Move[] {
    if (!isValidPosition(from)) return [];
    const piece = this.board[from.row][from.col];
    if (!piece) return [];
    return this.getLegalMoves(piece.color).filter((move) =>
      isSamePosition(move.from, from),
    );
  }

  /** Destination squares only - convenient for highlighting the board. */
  public getLegalDestinations(from: Position): Position[] {
    const seen = new Set<string>();
    const destinations: Position[] = [];
    for (const move of this.getLegalMovesFrom(from)) {
      const key = `${move.to.row},${move.to.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      destinations.push(move.to);
    }
    return destinations;
  }

  public generatePseudoLegalMoves(color: PieceColor): Move[] {
    const moves: Move[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (!piece || piece.color !== color) continue;
        const from = { row, col };
        switch (piece.type) {
          case 'pawn':
            this.addPawnMoves(from, piece, moves);
            break;
          case 'knight':
            this.addStepMoves(from, piece, KNIGHT_OFFSETS, moves);
            break;
          case 'king':
            this.addStepMoves(from, piece, KING_OFFSETS, moves);
            this.addCastlingMoves(from, piece, moves);
            break;
          case 'rook':
            this.addSlidingMoves(from, piece, ROOK_DIRECTIONS, moves);
            break;
          case 'bishop':
            this.addSlidingMoves(from, piece, BISHOP_DIRECTIONS, moves);
            break;
          case 'queen':
            this.addSlidingMoves(from, piece, ROOK_DIRECTIONS, moves);
            this.addSlidingMoves(from, piece, BISHOP_DIRECTIONS, moves);
            break;
        }
      }
    }
    return moves;
  }

  private addPawnMoves(from: Position, piece: Piece, moves: Move[]): void {
    const direction = piece.color === 'white' ? -1 : 1;
    const startRow = piece.color === 'white' ? 6 : 1;
    const promotionRow = piece.color === 'white' ? 0 : 7;

    const pushRow = from.row + direction;
    if (pushRow < 0 || pushRow > 7) return;

    if (!this.board[pushRow][from.col]) {
      this.addPawnMove(from, { row: pushRow, col: from.col }, piece, null, promotionRow, moves);

      if (from.row === startRow) {
        const doubleRow = from.row + 2 * direction;
        if (!this.board[doubleRow][from.col]) {
          moves.push({ from, to: { row: doubleRow, col: from.col }, piece });
        }
      }
    }

    for (const dc of [-1, 1]) {
      const col = from.col + dc;
      if (col < 0 || col > 7) continue;
      const target = this.board[pushRow][col];

      if (target) {
        if (target.color !== piece.color) {
          this.addPawnMove(from, { row: pushRow, col }, piece, target, promotionRow, moves);
        }
        continue;
      }

      if (
        this.enPassantTarget &&
        this.enPassantTarget.row === pushRow &&
        this.enPassantTarget.col === col
      ) {
        const capturedAt = { row: from.row, col };
        const capturedPawn = this.board[capturedAt.row][capturedAt.col];
        // Guard against a malformed FEN advertising an impossible ep square.
        if (capturedPawn?.type === 'pawn' && capturedPawn.color !== piece.color) {
          moves.push({
            from,
            to: { row: pushRow, col },
            piece,
            capturedPiece: capturedPawn,
            capturedAt,
            enPassant: true,
          });
        }
      }
    }
  }

  /** Expands a pawn move into four promotion moves when it reaches the last rank. */
  private addPawnMove(
    from: Position,
    to: Position,
    piece: Piece,
    captured: Piece | null,
    promotionRow: number,
    moves: Move[],
  ): void {
    if (to.row === promotionRow) {
      for (const promotion of PROMOTION_PIECES) {
        moves.push({
          from,
          to,
          piece,
          capturedPiece: captured ?? undefined,
          capturedAt: captured ? to : undefined,
          promotion,
        });
      }
      return;
    }
    moves.push({
      from,
      to,
      piece,
      capturedPiece: captured ?? undefined,
      capturedAt: captured ? to : undefined,
    });
  }

  private addStepMoves(
    from: Position,
    piece: Piece,
    offsets: Offsets,
    moves: Move[],
  ): void {
    for (const [dr, dc] of offsets) {
      const to = { row: from.row + dr, col: from.col + dc };
      if (!isValidPosition(to)) continue;
      const target = this.board[to.row][to.col];
      if (target && target.color === piece.color) continue;
      moves.push({
        from,
        to,
        piece,
        capturedPiece: target ?? undefined,
        capturedAt: target ? to : undefined,
      });
    }
  }

  private addSlidingMoves(
    from: Position,
    piece: Piece,
    directions: Offsets,
    moves: Move[],
  ): void {
    for (const [dr, dc] of directions) {
      for (let i = 1; i < 8; i++) {
        const to = { row: from.row + i * dr, col: from.col + i * dc };
        if (!isValidPosition(to)) break;
        const target = this.board[to.row][to.col];
        if (!target) {
          moves.push({ from, to, piece });
          continue;
        }
        if (target.color !== piece.color) {
          moves.push({ from, to, piece, capturedPiece: target, capturedAt: to });
        }
        break;
      }
    }
  }

  /**
   * Castling requires: the right is still held, the king and rook are actually
   * on their home squares, every square between them is empty, and the king is
   * not in check nor passes through (or lands on) an attacked square.
   */
  private addCastlingMoves(from: Position, piece: Piece, moves: Move[]): void {
    const homeRow = piece.color === 'white' ? 7 : 0;
    if (from.row !== homeRow || from.col !== 4) return;

    const kingside =
      piece.color === 'white'
        ? this.castlingRights.whiteKingside
        : this.castlingRights.blackKingside;
    const queenside =
      piece.color === 'white'
        ? this.castlingRights.whiteQueenside
        : this.castlingRights.blackQueenside;
    if (!kingside && !queenside) return;

    const enemy = getOppositeColor(piece.color);
    // Cheapest disqualifier first: castling out of check is never legal.
    if (this.isSquareAttacked(from, enemy)) return;

    const rookAt = (col: number): boolean => {
      const rook = this.board[homeRow][col];
      return rook?.type === 'rook' && rook.color === piece.color;
    };

    if (
      kingside &&
      rookAt(7) &&
      !this.board[homeRow][5] &&
      !this.board[homeRow][6] &&
      !this.isSquareAttacked({ row: homeRow, col: 5 }, enemy) &&
      !this.isSquareAttacked({ row: homeRow, col: 6 }, enemy)
    ) {
      moves.push({ from, to: { row: homeRow, col: 6 }, piece, castling: 'kingside' });
    }

    if (
      queenside &&
      rookAt(0) &&
      !this.board[homeRow][1] &&
      !this.board[homeRow][2] &&
      !this.board[homeRow][3] &&
      // b1/b8 may be attacked - only the king's own path matters.
      !this.isSquareAttacked({ row: homeRow, col: 3 }, enemy) &&
      !this.isSquareAttacked({ row: homeRow, col: 2 }, enemy)
    ) {
      moves.push({ from, to: { row: homeRow, col: 2 }, piece, castling: 'queenside' });
    }
  }

  // ------------------------------------------------------- making moves ----

  /**
   * Plays a move after checking it against the legal move list. Returns the move
   * that was played (with SAN attached) or `null` if it was not legal.
   */
  public makeMove(
    from: Position,
    to: Position,
    promotion?: PromotionPiece,
  ): Move | null {
    if (this.isGameOver()) return null;

    const legalBefore = this.getLegalMoves(this.currentPlayer);
    const candidates = legalBefore.filter(
      (move) => isSamePosition(move.from, from) && isSamePosition(move.to, to),
    );
    if (candidates.length === 0) return null;

    const move =
      candidates.find((candidate) => candidate.promotion === promotion) ??
      // Default an unspecified promotion to a queen rather than rejecting it.
      candidates.find((candidate) => candidate.promotion === 'queen') ??
      candidates[0];

    this.applyMove(move);
    if (this.trackRepetition) {
      this.undoStack[this.undoStack.length - 1].positionKey = this.recordPosition();
    }

    const opponentInCheck = this.isKingInCheck(this.currentPlayer);
    const opponentHasMoves = this.getLegalMoves(this.currentPlayer).length > 0;
    const played: Move = {
      ...move,
      san: this.toSAN(move, legalBefore, opponentInCheck, opponentInCheck && !opponentHasMoves),
    };
    this.moveHistory.push(played);
    return played;
  }

  /** True when the move needs the player to pick a promotion piece. */
  public requiresPromotion(from: Position, to: Position): boolean {
    return this.getLegalMovesFrom(from).some(
      (move) => isSamePosition(move.to, to) && Boolean(move.promotion),
    );
  }

  /** Takes back the last played move, including bookkeeping and history. */
  public undoLastMove(): Move | null {
    if (this.undoStack.length === 0) return null;
    const record = this.undoStack[this.undoStack.length - 1];
    if (this.trackRepetition && record.positionKey) {
      const count = this.positionCounts.get(record.positionKey) ?? 0;
      if (count <= 1) this.positionCounts.delete(record.positionKey);
      else this.positionCounts.set(record.positionKey, count - 1);
    }
    this.revertMove();
    return this.moveHistory.pop() ?? null;
  }

  /** Applies a move to the board without validating it. Used by the search. */
  public applyMove(move: Move): void {
    const piece = this.board[move.from.row][move.from.col];
    if (!piece) throw new Error(`No piece on ${getSquareName(move.from)}`);

    const capturedAt = move.capturedAt ?? (move.capturedPiece ? move.to : null);
    const captured = capturedAt ? this.board[capturedAt.row][capturedAt.col] : null;

    const record: UndoRecord = {
      move,
      movedPiece: piece,
      movedPieceHadMoved: piece.hasMoved,
      captured,
      capturedAt,
      rook: null,
      rookFrom: null,
      rookTo: null,
      rookHadMoved: false,
      castlingRights: this.castlingRights,
      enPassantTarget: this.enPassantTarget,
      halfmoveClock: this.halfmoveClock,
      fullmoveNumber: this.fullmoveNumber,
      positionKey: null,
    };

    if (capturedAt) this.board[capturedAt.row][capturedAt.col] = null;
    this.board[move.from.row][move.from.col] = null;
    this.board[move.to.row][move.to.col] = move.promotion
      ? { type: move.promotion, color: piece.color, hasMoved: true }
      : piece;
    piece.hasMoved = true;

    if (move.castling) {
      const homeRow = move.from.row;
      const rookFrom = { row: homeRow, col: move.castling === 'kingside' ? 7 : 0 };
      const rookTo = { row: homeRow, col: move.castling === 'kingside' ? 5 : 3 };
      const rook = this.board[rookFrom.row][rookFrom.col];
      if (rook) {
        record.rook = rook;
        record.rookFrom = rookFrom;
        record.rookTo = rookTo;
        record.rookHadMoved = rook.hasMoved;
        this.board[rookFrom.row][rookFrom.col] = null;
        this.board[rookTo.row][rookTo.col] = rook;
        rook.hasMoved = true;
      }
    }

    if (piece.type === 'king') this.kingPositions[piece.color] = move.to;

    this.updateCastlingRights(move, piece, captured, capturedAt);

    this.enPassantTarget =
      piece.type === 'pawn' && Math.abs(move.to.row - move.from.row) === 2
        ? { row: (move.from.row + move.to.row) / 2, col: move.from.col }
        : null;

    this.halfmoveClock = piece.type === 'pawn' || captured ? 0 : this.halfmoveClock + 1;
    if (this.currentPlayer === 'black') this.fullmoveNumber += 1;
    this.currentPlayer = getOppositeColor(this.currentPlayer);

    this.undoStack.push(record);
    this.invalidateCache();
  }

  /** Reverses the most recent `applyMove`. Does not touch `moveHistory`. */
  public revertMove(): void {
    const record = this.undoStack.pop();
    if (!record) return;
    const { move } = record;

    this.board[move.from.row][move.from.col] = record.movedPiece;
    record.movedPiece.hasMoved = record.movedPieceHadMoved;
    this.board[move.to.row][move.to.col] = null;

    if (record.capturedAt && record.captured) {
      this.board[record.capturedAt.row][record.capturedAt.col] = record.captured;
    }

    if (record.rook && record.rookFrom && record.rookTo) {
      this.board[record.rookTo.row][record.rookTo.col] = null;
      this.board[record.rookFrom.row][record.rookFrom.col] = record.rook;
      record.rook.hasMoved = record.rookHadMoved;
    }

    if (record.movedPiece.type === 'king') {
      this.kingPositions[record.movedPiece.color] = move.from;
    }

    this.castlingRights = record.castlingRights;
    this.enPassantTarget = record.enPassantTarget;
    this.halfmoveClock = record.halfmoveClock;
    this.fullmoveNumber = record.fullmoveNumber;
    this.currentPlayer = record.movedPiece.color;
    this.invalidateCache();
  }

  /**
   * A king move forfeits both rights; a rook leaving - or being captured on -
   * a corner forfeits that side. The capture case is the one that is easy to
   * miss: taking a rook on h8 must strip Black's kingside right.
   */
  private updateCastlingRights(
    move: Move,
    piece: Piece,
    captured: Piece | null,
    capturedAt: Position | null,
  ): void {
    const rights = { ...this.castlingRights };

    if (piece.type === 'king') {
      if (piece.color === 'white') {
        rights.whiteKingside = false;
        rights.whiteQueenside = false;
      } else {
        rights.blackKingside = false;
        rights.blackQueenside = false;
      }
    }

    const revokeCorner = (pos: Position) => {
      if (pos.row === 7 && pos.col === 0) rights.whiteQueenside = false;
      if (pos.row === 7 && pos.col === 7) rights.whiteKingside = false;
      if (pos.row === 0 && pos.col === 0) rights.blackQueenside = false;
      if (pos.row === 0 && pos.col === 7) rights.blackKingside = false;
    };

    if (piece.type === 'rook') revokeCorner(move.from);
    if (captured?.type === 'rook' && capturedAt) revokeCorner(capturedAt);

    this.castlingRights = rights;
  }

  // ------------------------------------------------------------ endings ----

  public isGameOver(): boolean {
    if (this.getLegalMoves(this.currentPlayer).length === 0) return true;
    return (
      this.hasInsufficientMaterial() ||
      this.halfmoveClock >= 100 ||
      this.isThreefoldRepetition()
    );
  }

  /**
   * The FIDE "dead position" cases detectable from material alone: K v K,
   * K+B v K, K+N v K and K+B v K+B with both bishops on one colour.
   * K+N+N v K is excluded - mate is not forced, but it is still reachable.
   */
  public hasInsufficientMaterial(): boolean {
    const minors: { color: PieceColor; type: PieceType; square: 'light' | 'dark' }[] = [];

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (!piece || piece.type === 'king') continue;
        if (piece.type === 'pawn' || piece.type === 'rook' || piece.type === 'queen') {
          return false;
        }
        minors.push({
          color: piece.color,
          type: piece.type,
          square: (row + col) % 2 === 0 ? 'light' : 'dark',
        });
      }
    }

    if (minors.length <= 1) return true;
    if (minors.length === 2) {
      const [a, b] = minors;
      if (a.type === 'bishop' && b.type === 'bishop' && a.color !== b.color) {
        return a.square === b.square;
      }
    }
    return false;
  }

  public isThreefoldRepetition(): boolean {
    if (!this.trackRepetition) return false;
    return (this.positionCounts.get(this.getPositionKey()) ?? 0) >= 3;
  }

  private recordPosition(): string {
    const key = this.getPositionKey();
    this.positionCounts.set(key, (this.positionCounts.get(key) ?? 0) + 1);
    return key;
  }

  /**
   * Positions repeat only if the side to move, castling rights and available
   * en passant capture all match too. The ep square is included only when a
   * capture is actually on offer, which is what FIDE compares.
   */
  private getPositionKey(): string {
    let placement = '';
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (!piece) {
          placement += '.';
          continue;
        }
        const letter = PIECE_TO_FEN[piece.type];
        placement += piece.color === 'white' ? letter.toUpperCase() : letter;
      }
    }

    const rights =
      (this.castlingRights.whiteKingside ? 'K' : '') +
      (this.castlingRights.whiteQueenside ? 'Q' : '') +
      (this.castlingRights.blackKingside ? 'k' : '') +
      (this.castlingRights.blackQueenside ? 'q' : '');

    const ep = this.hasEnPassantCapture()
      ? getSquareName(this.enPassantTarget as Position)
      : '-';

    return `${placement}|${this.currentPlayer}|${rights || '-'}|${ep}`;
  }

  private hasEnPassantCapture(): boolean {
    if (!this.enPassantTarget) return false;
    const { row, col } = this.enPassantTarget;
    const attackerRow = this.currentPlayer === 'white' ? row + 1 : row - 1;
    if (attackerRow < 0 || attackerRow > 7) return false;
    for (const dc of [-1, 1]) {
      const c = col + dc;
      if (c < 0 || c > 7) continue;
      const piece = this.board[attackerRow][c];
      if (piece?.type === 'pawn' && piece.color === this.currentPlayer) return true;
    }
    return false;
  }

  // ---------------------------------------------------------- notation ----

  /** Builds standard algebraic notation, including the minimum disambiguation. */
  private toSAN(
    move: Move,
    legalBefore: Move[],
    isCheck: boolean,
    isMate: boolean,
  ): string {
    const suffix = isMate ? '#' : isCheck ? '+' : '';
    if (move.castling) {
      return `${move.castling === 'kingside' ? 'O-O' : 'O-O-O'}${suffix}`;
    }

    const target = getSquareName(move.to);
    const isCapture = Boolean(move.capturedPiece);

    if (move.piece.type === 'pawn') {
      const body = isCapture ? `${FILES[move.from.col]}x${target}` : target;
      const promo = move.promotion ? `=${SAN_LETTER[move.promotion]}` : '';
      return `${body}${promo}${suffix}`;
    }

    const rivals = legalBefore.filter(
      (other) =>
        other.piece.type === move.piece.type &&
        other.piece.color === move.piece.color &&
        isSamePosition(other.to, move.to) &&
        !isSamePosition(other.from, move.from),
    );

    let disambiguation = '';
    if (rivals.length > 0) {
      const sameFile = rivals.some((other) => other.from.col === move.from.col);
      const sameRank = rivals.some((other) => other.from.row === move.from.row);
      if (!sameFile) disambiguation = FILES[move.from.col];
      else if (!sameRank) disambiguation = String(8 - move.from.row);
      else disambiguation = getSquareName(move.from);
    }

    return `${SAN_LETTER[move.piece.type]}${disambiguation}${
      isCapture ? 'x' : ''
    }${target}${suffix}`;
  }

  /**
   * Counts leaf nodes at `depth`. This is the standard correctness benchmark
   * for a move generator - the published node counts leave no room to be
   * subtly wrong about castling, en passant or promotion.
   */
  public perft(depth: number): number {
    if (depth === 0) return 1;
    const moves = this.getLegalMoves(this.currentPlayer);
    if (depth === 1) return moves.length;

    let nodes = 0;
    for (const move of moves) {
      this.applyMove(move);
      nodes += this.perft(depth - 1);
      this.revertMove();
    }
    return nodes;
  }
}
