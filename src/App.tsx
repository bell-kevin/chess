import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Crown,
  Handshake,
  Loader2,
  RotateCcw,
  Sliders,
  Trophy,
  Undo2,
} from 'lucide-react';
import { ChessBoard } from './ChessBoard';
import { PromotionDialog } from './PromotionDialog';
import { CapturedPieces, MoveHistory } from './GamePanels';
import { WinModePanel } from './WinModePanel';
import { useChessGame } from './useChessGame';
import { Difficulty } from './types';

const DIFFICULTIES: { value: Difficulty; label: string; description: string }[] = [
  { value: 'very-easy', label: 'Very Easy', description: 'Random legal moves — for learning the rules' },
  { value: 'easy', label: 'Easy', description: 'Spots captures, but blunders often' },
  { value: 'casual', label: 'Casual', description: 'Sees your reply, but misjudges longer trades' },
  { value: 'medium', label: 'Medium', description: 'Two-ply search with a little randomness' },
  { value: 'hard', label: 'Hard', description: 'Four-ply search; punishes loose pieces' },
  { value: 'very-hard', label: 'Very Hard', description: 'Deep search with quiescence — no free material' },
];

const CONTROL_BUTTON =
  'flex flex-1 basis-24 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold shadow transition active:scale-[.98] short:flex-none short:basis-auto short:px-4';

const RESULT_TEXT: Record<string, string> = {
  stalemate: 'Stalemate — the game is a draw.',
  'insufficient-material': 'Draw — neither side has enough material to mate.',
  'fifty-move': 'Draw by the fifty-move rule.',
  'threefold-repetition': 'Draw by threefold repetition.',
};

function App() {
  const controller = useChessGame('medium');
  const {
    state,
    selected,
    candidateMoves,
    pendingPromotion,
    isThinking,
    difficulty,
    playerColor,
    canUndo,
    winMode,
    hint,
    isHinting,
    setWinMode,
    selectSquare,
    completePromotion,
    cancelPromotion,
    setDifficulty,
    newGame,
    undo,
  } = controller;

  const [showDifficulty, setShowDifficulty] = useState(true);
  const [resultDismissed, setResultDismissed] = useState(false);

  // A dismissed result banner must reappear when the next game ends, so the
  // two actions that can un-end a game clear the flag as they go. Deriving it
  // from an effect on `gameOver` would fire a second render every time.
  const startNewGame = () => {
    setResultDismissed(false);
    newGame();
  };
  const takeBackMove = () => {
    setResultDismissed(false);
    undo();
  };

  const status = (() => {
    if (state.isCheckmate) {
      return state.winner === 'white'
        ? { text: 'Checkmate — you win!', tone: 'text-emerald-300', Icon: Trophy }
        : { text: 'Checkmate — the bot wins.', tone: 'text-rose-300', Icon: Trophy };
    }
    if (state.isDraw) {
      return {
        text: RESULT_TEXT[state.result ?? ''] ?? 'The game is a draw.',
        tone: 'text-amber-200',
        Icon: Handshake,
      };
    }
    // Check outranks the thinking message: that the bot is in check is the more
    // useful fact, and it is only ever true while the bot is on the clock. The
    // spinner still turns, so the move is not mistaken for a stalled game.
    if (state.isCheck) {
      return state.currentPlayer === 'white'
        ? { text: 'You are in check', tone: 'text-rose-300', Icon: AlertCircle }
        : {
            text: 'The bot is in check',
            tone: 'text-orange-300',
            Icon: isThinking ? Loader2 : AlertCircle,
          };
    }
    if (isThinking) {
      return { text: 'Bot is thinking…', tone: 'text-violet-300', Icon: Loader2 };
    }
    return state.currentPlayer === 'white'
      ? { text: 'Your move', tone: 'text-sky-300', Icon: Crown }
      : { text: 'Bot to move', tone: 'text-violet-300', Icon: Crown };
  })();

  const chooseDifficulty = (value: Difficulty) => {
    setDifficulty(value);
    setShowDifficulty(false);
  };

  const activeDifficulty = DIFFICULTIES.find((entry) => entry.value === difficulty);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
      {/*
        `justify-start` rather than `center`: a centred flex column clips its own
        overflow at the top on a short screen, hiding the header entirely.
      */}
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col items-center gap-4 px-3 py-4 sm:px-5 short:flex-row short:items-start short:justify-center short:gap-4 short:py-2 lg:flex-row lg:items-start lg:justify-center lg:gap-8 lg:py-8">
        <div className="flex w-full flex-col items-center gap-3 short:w-auto lg:w-auto">
          {/*
            Hidden on a landscape phone: the ~40px it costs is the difference
            between a usable board and one whose last rank is off screen.
          */}
          <header className="text-center short:hidden">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Chess Master</h1>
            <p className="text-sm text-slate-400">Play the AI · six difficulty levels</p>
          </header>

          <div className="flex w-full max-w-[34rem] items-center justify-between gap-3 px-1">
            <CapturedPieces moveHistory={state.moveHistory} color="white" />
            <p
              className={`flex items-center gap-2 text-sm font-semibold sm:text-base ${status.tone}`}
              role="status"
            >
              <status.Icon
                className={`h-4 w-4 shrink-0 ${isThinking ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{status.text}</span>
            </p>
            <CapturedPieces moveHistory={state.moveHistory} color="black" />
          </div>

          <ChessBoard
            gameState={state}
            selected={selected}
            candidateMoves={candidateMoves}
            disabled={state.gameOver || isThinking || pendingPromotion !== null}
            hint={hint && { from: hint.move.from, to: hint.move.to }}
            onSquareClick={selectSquare}
          />

          {/*
            The labels collapse to icons on a landscape phone, where three
            labelled buttons wrap onto a second row and push the board off
            screen. `aria-label` carries the meaning either way.
          */}
          <div className="flex w-full max-w-[34rem] flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={startNewGame}
              aria-label="Start a new game"
              className={`${CONTROL_BUTTON} bg-sky-600 hover:bg-sky-500`}
            >
              <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="short:hidden">New game</span>
            </button>
            <button
              type="button"
              onClick={takeBackMove}
              disabled={!canUndo}
              aria-label="Take back your last move"
              className={`${CONTROL_BUTTON} bg-slate-700 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="short:hidden">Undo</span>
            </button>
            <button
              type="button"
              onClick={() => setShowDifficulty(true)}
              aria-label={`Change difficulty (currently ${activeDifficulty?.label})`}
              className={`${CONTROL_BUTTON} bg-violet-600 hover:bg-violet-500`}
            >
              <Sliders className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="short:hidden">{activeDifficulty?.label ?? 'Difficulty'}</span>
            </button>
          </div>
        </div>

        <aside className="w-full max-w-[34rem] rounded-xl bg-slate-800/60 p-4 short:w-60 short:shrink-0 lg:w-72 lg:shrink-0">
          <div className="mb-4">
            <WinModePanel
              enabled={winMode}
              hint={hint}
              isHinting={isHinting}
              isPlayersTurn={state.currentPlayer === playerColor}
              gameOver={state.gameOver}
              onToggle={setWinMode}
            />
          </div>
          <MoveHistory moveHistory={state.moveHistory} />
          <dl className="mt-4 space-y-1 border-t border-slate-700 pt-3 text-xs text-slate-400">
            <div className="flex justify-between">
              <dt>Difficulty</dt>
              <dd className="font-medium text-slate-200">{activeDifficulty?.label}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Move</dt>
              <dd className="font-medium text-slate-200">{state.fullmoveNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Halfmove clock</dt>
              <dd className="font-medium text-slate-200">{state.halfmoveClock}/100</dd>
            </div>
          </dl>
        </aside>
      </div>

      {pendingPromotion && (
        <PromotionDialog
          color={state.currentPlayer}
          onSelect={completePromotion}
          onCancel={cancelPromotion}
        />
      )}

      {showDifficulty && (
        <DifficultyDialog
          current={difficulty}
          onSelect={chooseDifficulty}
          onClose={() => setShowDifficulty(false)}
        />
      )}

      {state.gameOver && !resultDismissed && !showDifficulty && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center text-slate-100 shadow-2xl"
            role="alertdialog"
            aria-labelledby="result-heading"
          >
            <status.Icon className="mx-auto mb-3 h-12 w-12 text-slate-300" aria-hidden="true" />
            <h2 id="result-heading" className="text-xl font-bold">
              {status.text}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              {state.moveHistory.length} moves · {activeDifficulty?.label}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={startNewGame}
                className="flex-1 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500"
              >
                Play again
              </button>
              <button
                type="button"
                onClick={() => setResultDismissed(true)}
                className="flex-1 rounded-lg bg-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-slate-600"
              >
                Review board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DifficultyDialogProps {
  current: Difficulty;
  onSelect: (difficulty: Difficulty) => void;
  onClose: () => void;
}

const DifficultyDialog = ({ current, onSelect, onClose }: DifficultyDialogProps) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="difficulty-heading"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800 p-5 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="difficulty-heading" className="mb-4 text-center text-xl font-bold text-slate-100">
          Choose a difficulty
        </h2>
        <div className="space-y-2">
          {DIFFICULTIES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => onSelect(entry.value)}
              aria-current={entry.value === current}
              className={`w-full rounded-xl border-2 p-3 text-left transition ${
                entry.value === current
                  ? 'border-sky-500 bg-sky-500/15'
                  : 'border-slate-700 bg-slate-900/40 hover:border-sky-400 hover:bg-slate-700/60'
              }`}
            >
              <span className="block font-semibold text-slate-100">{entry.label}</span>
              <span className="mt-0.5 block text-sm text-slate-400">{entry.description}</span>
            </button>
          ))}
        </div>
        {/* Opening this mid-game must be escapable without changing anything. */}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
        >
          Keep playing
        </button>
      </div>
    </div>
  );
};

export default App;
