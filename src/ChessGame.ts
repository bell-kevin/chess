import { GameState, Piece, Position, Move, PieceColor, PieceType } from './types';
import { isValidPosition, isSamePosition, getOppositeColor, copyBoard } from './utils';

export class ChessGame {
  private gameState: GameState;

  constructor() {
    this.gameState = this.initializeGame();
  }

  private initializeGame(): GameState {
    const board = this.createInitialBoard();
    return {
      board,
      currentPlayer: 'white',
      isCheck: false,
      isCheckmate: false,
      isStalemate: false,
      gameOver: false,
      selectedSquare: null,
      legalMoves: [],
      moveHistory: [],
      difficulty: 'medium',
    };
  }

  private createInitialBoard(): (Piece | null)[][] {
    const board: (Piece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    
    // Place white pieces
    const whitePieces: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (let col = 0; col < 8; col++) {
      board[7][col] = { type: whitePieces[col], color: 'white', hasMoved: false };
      board[6][col] = { type: 'pawn', color: 'white', hasMoved: false };
    }

    // Place black pieces
    const blackPieces: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (let col = 0; col < 8; col++) {
      board[0][col] = { type: blackPieces[col], color: 'black', hasMoved: false };
      board[1][col] = { type: 'pawn', color: 'black', hasMoved: false };
    }

    return board;
  }

  public getGameState(): GameState {
    return { ...this.gameState };
  }

  public setDifficulty(difficulty: GameState['difficulty']): void {
    this.gameState.difficulty = difficulty;
  }

  public selectSquare(position: Position): void {
    if (this.gameState.gameOver || this.gameState.currentPlayer === 'black') return;

    const piece = this.gameState.board[position.row][position.col];
    
    if (this.gameState.selectedSquare) {
      // Check if clicking on a legal move
      const isLegalMove = this.gameState.legalMoves.some(move => 
        isSamePosition(move, position)
      );

      if (isLegalMove) {
        this.makeMove(this.gameState.selectedSquare, position);
      } else if (piece && piece.color === this.gameState.currentPlayer) {
        // Select new piece
        this.gameState.selectedSquare = position;
        this.gameState.legalMoves = this.getLegalMoves(position);
      } else {
        // Deselect
        this.gameState.selectedSquare = null;
        this.gameState.legalMoves = [];
      }
    } else if (piece && piece.color === this.gameState.currentPlayer) {
      // Select piece
      this.gameState.selectedSquare = position;
      this.gameState.legalMoves = this.getLegalMoves(position);
    }
  }

  public makeMove(from: Position, to: Position): boolean {
    const piece = this.gameState.board[from.row][from.col];
    if (!piece) return false;

    const capturedPiece = this.gameState.board[to.row][to.col];
    
    // Create move object
    const move: Move = {
      from,
      to,
      piece: { ...piece },
      capturedPiece: capturedPiece ? { ...capturedPiece } : undefined,
    };

    // Make the move
    this.gameState.board[to.row][to.col] = { ...piece, hasMoved: true };
    this.gameState.board[from.row][from.col] = null;

    // Handle pawn promotion
    if (piece.type === 'pawn') {
      if ((piece.color === 'white' && to.row === 0) || (piece.color === 'black' && to.row === 7)) {
        this.gameState.board[to.row][to.col] = { ...piece, type: 'queen', hasMoved: true };
        move.promotion = 'queen';
      }
    }

    // Add move to history
    this.gameState.moveHistory.push(move);

    // Switch players
    this.gameState.currentPlayer = getOppositeColor(this.gameState.currentPlayer);
    
    // Clear selection
    this.gameState.selectedSquare = null;
    this.gameState.legalMoves = [];

    // Update game status
    this.updateGameStatus();

    return true;
  }

  public getLegalMoves(position: Position): Position[] {
    const piece = this.gameState.board[position.row][position.col];
    if (!piece) return [];

    const moves: Position[] = [];

    switch (piece.type) {
      case 'pawn':
        moves.push(...this.getPawnMoves(position));
        break;
      case 'rook':
        moves.push(...this.getRookMoves(position));
        break;
      case 'knight':
        moves.push(...this.getKnightMoves(position));
        break;
      case 'bishop':
        moves.push(...this.getBishopMoves(position));
        break;
      case 'queen':
        moves.push(...this.getQueenMoves(position));
        break;
      case 'king':
        moves.push(...this.getKingMoves(position));
        break;
    }

    // Filter out moves that would put own king in check
    return moves.filter(move => !this.wouldBeInCheck(position, move, piece.color));
  }

  private getPawnMoves(position: Position): Position[] {
    const moves: Position[] = [];
    const piece = this.gameState.board[position.row][position.col]!;
    const direction = piece.color === 'white' ? -1 : 1;
    const startRow = piece.color === 'white' ? 6 : 1;

    // Forward move
    const oneForward = { row: position.row + direction, col: position.col };
    if (isValidPosition(oneForward) && !this.gameState.board[oneForward.row][oneForward.col]) {
      moves.push(oneForward);

      // Two squares forward from starting position
      if (position.row === startRow) {
        const twoForward = { row: position.row + 2 * direction, col: position.col };
        if (isValidPosition(twoForward) && !this.gameState.board[twoForward.row][twoForward.col]) {
          moves.push(twoForward);
        }
      }
    }

    // Diagonal captures
    for (const colOffset of [-1, 1]) {
      const capturePos = { row: position.row + direction, col: position.col + colOffset };
      if (isValidPosition(capturePos)) {
        const targetPiece = this.gameState.board[capturePos.row][capturePos.col];
        if (targetPiece && targetPiece.color !== piece.color) {
          moves.push(capturePos);
        }
      }
    }

    return moves;
  }

  private getRookMoves(position: Position): Position[] {
    const moves: Position[] = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];

    for (const [rowDir, colDir] of directions) {
      for (let i = 1; i < 8; i++) {
        const newPos = { row: position.row + i * rowDir, col: position.col + i * colDir };
        if (!isValidPosition(newPos)) break;

        const targetPiece = this.gameState.board[newPos.row][newPos.col];
        if (!targetPiece) {
          moves.push(newPos);
        } else {
          if (targetPiece.color !== this.gameState.board[position.row][position.col]!.color) {
            moves.push(newPos);
          }
          break;
        }
      }
    }

    return moves;
  }

  private getKnightMoves(position: Position): Position[] {
    const moves: Position[] = [];
    const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

    for (const [rowOffset, colOffset] of knightMoves) {
      const newPos = { row: position.row + rowOffset, col: position.col + colOffset };
      if (isValidPosition(newPos)) {
        const targetPiece = this.gameState.board[newPos.row][newPos.col];
        if (!targetPiece || targetPiece.color !== this.gameState.board[position.row][position.col]!.color) {
          moves.push(newPos);
        }
      }
    }

    return moves;
  }

  private getBishopMoves(position: Position): Position[] {
    const moves: Position[] = [];
    const directions = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    for (const [rowDir, colDir] of directions) {
      for (let i = 1; i < 8; i++) {
        const newPos = { row: position.row + i * rowDir, col: position.col + i * colDir };
        if (!isValidPosition(newPos)) break;

        const targetPiece = this.gameState.board[newPos.row][newPos.col];
        if (!targetPiece) {
          moves.push(newPos);
        } else {
          if (targetPiece.color !== this.gameState.board[position.row][position.col]!.color) {
            moves.push(newPos);
          }
          break;
        }
      }
    }

    return moves;
  }

  private getQueenMoves(position: Position): Position[] {
    return [...this.getRookMoves(position), ...this.getBishopMoves(position)];
  }

  private getKingMoves(position: Position): Position[] {
    const moves: Position[] = [];
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

    for (const [rowDir, colDir] of directions) {
      const newPos = { row: position.row + rowDir, col: position.col + colDir };
      if (isValidPosition(newPos)) {
        const targetPiece = this.gameState.board[newPos.row][newPos.col];
        if (!targetPiece || targetPiece.color !== this.gameState.board[position.row][position.col]!.color) {
          moves.push(newPos);
        }
      }
    }

    return moves;
  }

  private wouldBeInCheck(from: Position, to: Position, color: PieceColor): boolean {
    // Create a temporary board with the move made
    const tempBoard = copyBoard(this.gameState.board);
    tempBoard[to.row][to.col] = tempBoard[from.row][from.col];
    tempBoard[from.row][from.col] = null;

    return this.isKingInCheck(color, tempBoard);
  }

  private isKingInCheck(color: PieceColor, board?: (Piece | null)[][]): boolean {
    const boardToCheck = board || this.gameState.board;
    
    // Find the king
    let kingPos: Position | null = null;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = boardToCheck[row][col];
        if (piece && piece.type === 'king' && piece.color === color) {
          kingPos = { row, col };
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return false;

    // Check if any opponent piece can attack the king
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = boardToCheck[row][col];
        if (piece && piece.color !== color) {
          const tempGame = new ChessGame();
          tempGame.gameState.board = boardToCheck;
          const moves = tempGame.getLegalMovesIgnoringCheck({ row, col });
          if (moves.some(move => isSamePosition(move, kingPos!))) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private getLegalMovesIgnoringCheck(position: Position): Position[] {
    const piece = this.gameState.board[position.row][position.col];
    if (!piece) return [];

    switch (piece.type) {
      case 'pawn': return this.getPawnMoves(position);
      case 'rook': return this.getRookMoves(position);
      case 'knight': return this.getKnightMoves(position);
      case 'bishop': return this.getBishopMoves(position);
      case 'queen': return this.getQueenMoves(position);
      case 'king': return this.getKingMoves(position);
      default: return [];
    }
  }

  private updateGameStatus(): void {
    this.gameState.isCheck = this.isKingInCheck(this.gameState.currentPlayer);
    
    // Check for checkmate or stalemate
    let hasLegalMoves = false;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.gameState.board[row][col];
        if (piece && piece.color === this.gameState.currentPlayer) {
          const moves = this.getLegalMoves({ row, col });
          if (moves.length > 0) {
            hasLegalMoves = true;
            break;
          }
        }
      }
      if (hasLegalMoves) break;
    }

    if (!hasLegalMoves) {
      if (this.gameState.isCheck) {
        this.gameState.isCheckmate = true;
        this.gameState.gameOver = true;
      } else {
        this.gameState.isStalemate = true;
        this.gameState.gameOver = true;
      }
    }
  }

  public getAllLegalMoves(color: PieceColor): Move[] {
    const moves: Move[] = [];
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.gameState.board[row][col];
        if (piece && piece.color === color) {
          const legalMoves = this.getLegalMoves({ row, col });
          for (const move of legalMoves) {
            moves.push({
              from: { row, col },
              to: move,
              piece: { ...piece },
              capturedPiece: this.gameState.board[move.row][move.col] ? 
                { ...this.gameState.board[move.row][move.col]! } : undefined,
            });
          }
        }
      }
    }

    return moves;
  }

  public resetGame(): void {
    this.gameState = this.initializeGame();
  }
}