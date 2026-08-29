import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessGame } from './ChessGame';
import { BotRunner, createBotRunner } from './botRunner';
import { Difficulty, GameState, Move, Position, PromotionPiece } from './types';
import { getOppositeColor, isSamePosition } from './utils';

/** A pawn move waiting on the player to choose what it becomes. */
export interface PendingPromotion {
  from: Position;
  to: Position;
}

export interface ChessGameController {
  state: GameState;
  selected: Position | null;
  /** Legal moves from the selected square, for highlighting. */
  candidateMoves: Move[];
  pendingPromotion: PendingPromotion | null;
  isThinking: boolean;
  difficulty: Difficulty;
  playerColor: 'white';
  canUndo: boolean;
  selectSquare: (position: Position) => void;
  completePromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
  setDifficulty: (difficulty: Difficulty) => void;
  newGame: () => void;
  undo: () => void;
}

const PLAYER_COLOR = 'white' as const;
const BOT_COLOR = getOppositeColor(PLAYER_COLOR);

/** Keeps the bot from answering instantly, which reads as jarring. */
const MIN_THINKING_MS = 350;

export const useChessGame = (
  initialDifficulty: Difficulty = 'medium',
): ChessGameController => {
  const [game] = useState(() => new ChessGame());

  const [state, setState] = useState<GameState>(() => game.getGameState());
  const [selected, setSelected] = useState<Position | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(
    null,
  );
  const [difficulty, setDifficultyState] = useState<Difficulty>(initialDifficulty);

  const isThinking = state.currentPlayer === BOT_COLOR && !state.gameOver;

  const runnerRef = useRef<BotRunner | null>(null);
  /**
   * Created on demand rather than during render: StrictMode mounts, unmounts
   * and remounts in development, and a runner disposed by that first unmount
   * would otherwise never be replaced.
   */
  const getRunner = useCallback((): BotRunner => {
    if (!runnerRef.current) runnerRef.current = createBotRunner();
    return runnerRef.current;
  }, []);

  /**
   * Incremented whenever the player changes the position out from under an
   * in-flight search (new game, undo, difficulty change). A reply carrying an
   * older token is discarded rather than played.
   */
  const turnToken = useRef(0);

  useEffect(
    () => () => {
      turnToken.current += 1;
      runnerRef.current?.dispose();
      runnerRef.current = null;
    },
    [],
  );

  const sync = useCallback(() => {
    setState(game.getGameState());
  }, [game]);

  const invalidateSearch = useCallback(() => {
    turnToken.current += 1;
  }, []);

  // Computed on every render rather than memoised: the engine caches its legal
  // move list internally, and memoising on `selected` alone would serve stale
  // moves the moment the board changed underneath a live selection.
  const candidateMoves = selected ? game.getLegalMovesFrom(selected) : [];

  const selectSquare = useCallback(
    (position: Position) => {
      if (state.gameOver || pendingPromotion) return;
      if (state.currentPlayer !== PLAYER_COLOR) return;

      const piece = game.getPieceAt(position);

      if (selected) {
        if (isSamePosition(selected, position)) {
          setSelected(null);
          return;
        }

        const move = game
          .getLegalMovesFrom(selected)
          .find((candidate) => isSamePosition(candidate.to, position));

        if (move) {
          if (move.promotion) {
            // Hold the move until the player has picked a piece.
            setPendingPromotion({ from: selected, to: position });
            setSelected(null);
            return;
          }
          game.makeMove(move.from, move.to);
          setSelected(null);
          sync();
          return;
        }
      }

      // Selecting one of your own pieces always re-targets, even mid-selection.
      setSelected(piece && piece.color === PLAYER_COLOR ? position : null);
    },
    [game, pendingPromotion, selected, state.currentPlayer, state.gameOver, sync],
  );

  const completePromotion = useCallback(
    (piece: PromotionPiece) => {
      if (!pendingPromotion) return;
      game.makeMove(pendingPromotion.from, pendingPromotion.to, piece);
      setPendingPromotion(null);
      setSelected(null);
      sync();
    },
    [game, pendingPromotion, sync],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelected(null);
  }, []);

  const newGame = useCallback(() => {
    invalidateSearch();
    game.reset();
    setSelected(null);
    setPendingPromotion(null);
    sync();
  }, [game, invalidateSearch, sync]);

  /**
   * Takes back a full move: the bot's reply and the player's own move, so the
   * player always lands back on their own turn.
   */
  const undo = useCallback(() => {
    invalidateSearch();
    const history = game.getMoveHistory();
    if (history.length === 0) return;

    game.undoLastMove();
    // If that only undid the player's own move we are already on their turn.
    if (game.getCurrentPlayer() !== PLAYER_COLOR) game.undoLastMove();

    setSelected(null);
    setPendingPromotion(null);
    sync();
  }, [game, invalidateSearch, sync]);

  const setDifficulty = useCallback(
    (next: Difficulty) => {
      invalidateSearch();
      setDifficultyState(next);
    },
    [invalidateSearch],
  );

  // Drive the bot whenever it is its turn.
  useEffect(() => {
    if (state.currentPlayer !== BOT_COLOR || state.gameOver) return;

    const runner = getRunner();
    const token = ++turnToken.current;
    let cancelled = false;
    const startedAt = Date.now();
    const fen = game.toFEN();

    runner
      .requestMove(fen, difficulty)
      .then((move) => {
        if (cancelled || token !== turnToken.current) return;

        const settle = () => {
          if (cancelled || token !== turnToken.current) return;
          if (!move) return;
          // The engine validates, so an unexpected reply is dropped rather
          // than trusted; the effect will simply run again.
          if (game.makeMove(move.from, move.to, move.promotion)) sync();
        };

        const elapsed = Date.now() - startedAt;
        if (elapsed >= MIN_THINKING_MS) settle();
        else setTimeout(settle, MIN_THINKING_MS - elapsed);
      })
      .catch((error) => {
        console.error('Chess bot failed:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [difficulty, game, getRunner, state.currentPlayer, state.gameOver, sync]);

  return {
    state,
    selected,
    candidateMoves,
    pendingPromotion,
    isThinking,
    difficulty,
    playerColor: PLAYER_COLOR,
    canUndo: state.moveHistory.length > 0 && !isThinking,
    selectSquare,
    completePromotion,
    cancelPromotion,
    setDifficulty,
    newGame,
    undo,
  };
};
