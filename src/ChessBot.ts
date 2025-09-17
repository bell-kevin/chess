import { ChessGame } from './ChessGame';
import { Move, Position, Piece, PieceColor, Difficulty } from './types';
import { copyBoard } from './utils';

export class ChessBot {
  private game: ChessGame;
  private difficulty: Difficulty;

  constructor(game: ChessGame, difficulty: Difficulty = 'medium') {
    this.game = game;
    this.difficulty = difficulty;
  }

  public setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
  }

  public getBestMove(): Move | null {
    const gameState = this.game.getGameState();
    const legalMoves = this.game.getAllLegalMoves('black');
    
    if (legalMoves.length === 0) return null;

    switch (this.difficulty) {
      case 'very-easy':
        return this.getRandomMove(legalMoves);
      case 'easy':
        return this.getEasyMove(legalMoves);
      case 'medium':
        return this.getMediumMove(legalMoves);
      case 'hard':
        return this.getHardMove(legalMoves, 3);
      case 'very-hard':
        return this.getVeryHardMove(legalMoves, 4);
      default:
        return this.getRandomMove(legalMoves);
    }
  }

  private getRandomMove(moves: Move[]): Move {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  private getEasyMove(moves: Move[]): Move {
    // Prefer captures, but still mostly random
    const captures = moves.filter(move => move.capturedPiece);
    
    if (captures.length > 0 && Math.random() < 0.6) {
      return captures[Math.floor(Math.random() * captures.length)];
    }
    
    return this.getRandomMove(moves);
  }

  private getMediumMove(moves: Move[]): Move {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const score = this.evaluateMove(move);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    // Add some randomness
    const goodMoves = moves.filter(move => 
      this.evaluateMove(move) >= bestScore - 50
    );

    return goodMoves[Math.floor(Math.random() * goodMoves.length)];
  }

  private getHardMove(moves: Move[], depth: number): Move {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      const score = this.minimax(move, depth - 1, false, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private getVeryHardMove(moves: Move[], depth: number): Move {
    // Sort moves by initial evaluation for better alpha-beta pruning
    const sortedMoves = moves.sort((a, b) => 
      this.evaluateMove(b) - this.evaluateMove(a)
    );

    let bestMove = sortedMoves[0];
    let bestScore = -Infinity;

    for (const move of sortedMoves) {
      const score = this.minimax(move, depth - 1, false, -Infinity, Infinity);
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return bestMove;
  }

  private minimax(
    move: Move, 
    depth: number, 
    isMaximizing: boolean, 
    alpha: number, 
    beta: number
  ): number {
    if (depth === 0) {
      return this.evaluateMove(move);
    }

    // Create temporary game state
    const tempGame = new ChessGame();
    const currentState = this.game.getGameState();
    tempGame['gameState'] = {
      ...currentState,
      board: copyBoard(currentState.board)
    };

    // Make the move
    tempGame.makeMove(move.from, move.to);
    const newState = tempGame.getGameState();

    if (newState.isCheckmate) {
      return isMaximizing ? -10000 : 10000;
    }

    const nextColor: PieceColor = isMaximizing ? 'white' : 'black';
    const nextMoves = tempGame.getAllLegalMoves(nextColor);

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const nextMove of nextMoves) {
        const evaluation = this.minimax(nextMove, depth - 1, false, alpha, beta);
        maxEval = Math.max(maxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const nextMove of nextMoves) {
        const evaluation = this.minimax(nextMove, depth - 1, true, alpha, beta);
        minEval = Math.min(minEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (beta <= alpha) break; // Alpha-beta pruning
      }
      return minEval;
    }
  }

  private evaluateMove(move: Move): number {
    let score = 0;

    // Material value
    if (move.capturedPiece) {
      score += this.getPieceValue(move.capturedPiece);
    }

    // Position value
    score += this.getPositionValue(move.piece, move.to);

    // Penalty for moving the same piece multiple times in opening
    const gameState = this.game.getGameState();
    if (gameState.moveHistory.length < 10) {
      const pieceMovedBefore = gameState.moveHistory.filter(
        m => m.piece.type === move.piece.type && m.piece.color === move.piece.color
      ).length;
      score -= pieceMovedBefore * 10;
    }

    // Center control
    if (this.isCenter(move.to)) {
      score += 20;
    }

    // King safety
    if (move.piece.type === 'king' && gameState.moveHistory.length < 15) {
      score -= 50; // Discourage early king moves
    }

    return score;
  }

  private getPieceValue(piece: Piece): number {
    const values = {
      pawn: 100,
      knight: 320,
      bishop: 330,
      rook: 500,
      queen: 900,
      king: 20000,
    };
    return values[piece.type];
  }

  private getPositionValue(piece: Piece, position: Position): number {
    // Simple position tables (black's perspective)
    const pawnTable = [
      [0,  0,  0,  0,  0,  0,  0,  0],
      [50, 50, 50, 50, 50, 50, 50, 50],
      [10, 10, 20, 30, 30, 20, 10, 10],
      [5,  5, 10, 25, 25, 10,  5,  5],
      [0,  0,  0, 20, 20,  0,  0,  0],
      [5, -5,-10,  0,  0,-10, -5,  5],
      [5, 10, 10,-20,-20, 10, 10,  5],
      [0,  0,  0,  0,  0,  0,  0,  0]
    ];

    const knightTable = [
      [-50,-40,-30,-30,-30,-30,-40,-50],
      [-40,-20,  0,  0,  0,  0,-20,-40],
      [-30,  0, 10, 15, 15, 10,  0,-30],
      [-30,  5, 15, 20, 20, 15,  5,-30],
      [-30,  0, 15, 20, 20, 15,  0,-30],
      [-30,  5, 10, 15, 15, 10,  5,-30],
      [-40,-20,  0,  5,  5,  0,-20,-40],
      [-50,-40,-30,-30,-30,-30,-40,-50]
    ];

    switch (piece.type) {
      case 'pawn':
        return pawnTable[position.row][position.col] / 10;
      case 'knight':
        return knightTable[position.row][position.col] / 10;
      default:
        return 0;
    }
  }

  private isCenter(position: Position): boolean {
    return (position.row >= 2 && position.row <= 5) && 
           (position.col >= 2 && position.col <= 5);
  }
}