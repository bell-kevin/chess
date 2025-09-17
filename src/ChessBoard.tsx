import React from 'react';
import { Position, Piece, GameState } from './types';
import { getSquareColor, getPieceSymbol, isSamePosition } from './utils';

interface ChessBoardProps {
  gameState: GameState;
  onSquareClick: (position: Position) => void;
}

export const ChessBoard: React.FC<ChessBoardProps> = ({ gameState, onSquareClick }) => {
  const renderSquare = (row: number, col: number) => {
    const position: Position = { row, col };
    const piece = gameState.board[row][col];
    const isSelected = gameState.selectedSquare && isSamePosition(gameState.selectedSquare, position);
    const isLegalMove = gameState.legalMoves.some(move => isSamePosition(move, position));
    const squareColor = getSquareColor(row, col);

    let squareClass = 'w-16 h-16 flex items-center justify-center text-4xl cursor-pointer transition-all duration-200 ';
    
    if (squareColor === 'light') {
      squareClass += 'bg-amber-100 ';
    } else {
      squareClass += 'bg-amber-800 ';
    }

    if (isSelected) {
      squareClass += 'ring-4 ring-blue-400 ring-inset ';
    }

    if (isLegalMove) {
      if (piece) {
        squareClass += 'ring-4 ring-red-400 ring-inset '; // Capture
      } else {
        squareClass += 'after:content-[""] after:absolute after:w-4 after:h-4 after:bg-green-400 after:rounded-full after:opacity-70 relative ';
      }
    }

    if (gameState.isCheck && piece && piece.type === 'king' && piece.color === gameState.currentPlayer) {
      squareClass += 'bg-red-300 ';
    }

    return (
      <div
        key={`${row}-${col}`}
        className={squareClass}
        onClick={() => onSquareClick(position)}
      >
        {piece && (
          <span 
            className={`select-none transition-transform duration-200 hover:scale-110 ${
              piece.color === 'white' ? 'text-white' : 'text-black'
            } ${piece.color === 'white' ? 'drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]' : 'drop-shadow-[0_2px_2px_rgba(255,255,255,0.8)]'}`}
          >
            {getPieceSymbol(piece)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="inline-block border-4 border-amber-900 shadow-2xl">
      <div className="grid grid-cols-8 gap-0">
        {Array.from({ length: 8 }, (_, row) =>
          Array.from({ length: 8 }, (_, col) => renderSquare(row, col))
        )}
      </div>
    </div>
  );
};