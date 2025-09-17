import React, { useState, useEffect } from 'react';
import { ChessBoard } from './ChessBoard';
import { ChessGame } from './ChessGame';
import { ChessBot } from './ChessBot';
import { Position, Difficulty } from './types';
import { RotateCcw, Crown, AlertCircle, Trophy } from 'lucide-react';

function App() {
  const [game] = useState(() => new ChessGame());
  const [bot] = useState(() => new ChessBot(game));
  const [gameState, setGameState] = useState(game.getGameState());
  const [showDifficultyModal, setShowDifficultyModal] = useState(true);

  const difficulties: { value: Difficulty; label: string; description: string }[] = [
    { value: 'very-easy', label: 'Very Easy', description: 'Random moves - perfect for beginners' },
    { value: 'easy', label: 'Easy', description: 'Simple tactics with some randomness' },
    { value: 'medium', label: 'Medium', description: 'Good tactical play and positioning' },
    { value: 'hard', label: 'Hard', description: 'Advanced strategy with lookahead' },
    { value: 'very-hard', label: 'Very Hard', description: 'Expert level with deep analysis' },
  ];

  useEffect(() => {
    if (gameState.currentPlayer === 'black' && !gameState.gameOver) {
      const timer = setTimeout(() => {
        const move = bot.getBestMove();
        if (move) {
          game.makeMove(move.from, move.to);
          setGameState(game.getGameState());
        }
      }, 1000); // 1 second delay for bot move

      return () => clearTimeout(timer);
    }
  }, [gameState.currentPlayer, gameState.gameOver, bot, game]);

  const handleSquareClick = (position: Position) => {
    game.selectSquare(position);
    setGameState(game.getGameState());
  };

  const handleResetGame = () => {
    game.resetGame();
    setGameState(game.getGameState());
  };

  const handleDifficultySelect = (difficulty: Difficulty) => {
    game.setDifficulty(difficulty);
    bot.setDifficulty(difficulty);
    setGameState(game.getGameState());
    setShowDifficultyModal(false);
  };

  const getStatusMessage = () => {
    if (gameState.isCheckmate) {
      return gameState.currentPlayer === 'white' ? 
        { message: 'Checkmate! Black wins!', color: 'text-red-600', icon: Trophy } :
        { message: 'Checkmate! You win!', color: 'text-green-600', icon: Trophy };
    }
    if (gameState.isStalemate) {
      return { message: 'Stalemate! It\'s a draw!', color: 'text-yellow-600', icon: AlertCircle };
    }
    if (gameState.isCheck) {
      return gameState.currentPlayer === 'white' ? 
        { message: 'You are in check!', color: 'text-red-600', icon: AlertCircle } :
        { message: 'Bot is in check!', color: 'text-orange-600', icon: AlertCircle };
    }
    return gameState.currentPlayer === 'white' ? 
      { message: 'Your turn', color: 'text-blue-600', icon: Crown } :
      { message: 'Bot is thinking...', color: 'text-purple-600', icon: Crown };
  };

  const status = getStatusMessage();
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Difficulty Selection Modal */}
      {showDifficultyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Select Difficulty</h2>
            <div className="space-y-3">
              {difficulties.map((difficulty) => (
                <button
                  key={difficulty.value}
                  onClick={() => handleDifficultySelect(difficulty.value)}
                  className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all duration-200"
                >
                  <div className="font-semibold text-gray-800">{difficulty.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{difficulty.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Chess Master</h1>
          <p className="text-gray-300">Challenge the AI • Test your skills</p>
        </div>

        {/* Game Info */}
        <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-lg p-6 text-center min-w-64">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <StatusIcon className="w-6 h-6" />
            <span className={`text-xl font-semibold ${status.color}`}>{status.message}</span>
          </div>
          
          <div className="text-white text-sm space-y-2">
            <div>Difficulty: <span className="font-semibold capitalize">{gameState.difficulty.replace('-', ' ')}</span></div>
            <div>Moves: <span className="font-semibold">{gameState.moveHistory.length}</span></div>
          </div>
        </div>

        {/* Chess Board */}
        <div className="relative">
          <ChessBoard gameState={gameState} onSquareClick={handleSquareClick} />
          
          {/* Coordinate Labels */}
          <div className="absolute -left-8 top-0 h-full flex flex-col justify-around text-white text-sm font-semibold">
            {['8', '7', '6', '5', '4', '3', '2', '1'].map((num) => (
              <div key={num} className="h-16 flex items-center">{num}</div>
            ))}
          </div>
          <div className="absolute -bottom-8 left-0 w-full flex justify-around text-white text-sm font-semibold">
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((letter) => (
              <div key={letter} className="w-16 text-center">{letter}</div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex space-x-4">
          <button
            onClick={handleResetGame}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors duration-200 font-semibold shadow-lg"
          >
            <RotateCcw className="w-5 h-5" />
            <span>New Game</span>
          </button>
          
          <button
            onClick={() => setShowDifficultyModal(true)}
            className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors duration-200 font-semibold shadow-lg"
          >
            <Crown className="w-5 h-5" />
            <span>Change Difficulty</span>
          </button>
        </div>

        {/* Game Over Overlay */}
        {gameState.gameOver && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-40">
            <div className="bg-white rounded-lg shadow-2xl p-8 text-center max-w-md">
              <StatusIcon className="w-16 h-16 mx-auto mb-4 text-gray-700" />
              <h2 className="text-2xl font-bold text-gray-800 mb-4">{status.message}</h2>
              <div className="space-y-2 text-gray-600 mb-6">
                <p>Total moves: {gameState.moveHistory.length}</p>
                <p>Difficulty: {gameState.difficulty.replace('-', ' ')}</p>
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={handleResetGame}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg transition-colors duration-200 font-semibold"
                >
                  Play Again
                </button>
                <button
                  onClick={() => setShowDifficultyModal(true)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg transition-colors duration-200 font-semibold"
                >
                  Change Difficulty
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;