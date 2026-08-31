import { useCallback, useEffect, useRef, useState } from 'react';
import { ChessGame } from './ChessGame';
import { BotAnalysis } from './botProtocol';
import { BotRunner, createBotRunner } from './botRunner';
import { Difficulty, GameState, Move, Position, PromotionPiece } from './types';
import { getOppositeColor, isSamePosition } from './utils';

/** A pawn move waiting on the player to choose what it becomes. */
export interface PendingPromotion {
  from: Position;
  to: Position;
}

/**
 * What win mode is showing: the move to play now, and what the search made of
 * the position behind it.
 */
export interface WinHint {
  /** The recommended move, taken from the game's own legal move list. */
  move: Move;
  /** Centipawns from the player's point of view; positive means they are better. */
  score: number;
  /** Moves to mate: positive the player gives it, negative they receive it. */
  mateIn: number | null;
  /** How deep the search got, in plies. */
  depth: number;
  /** The expected continuation in algebraic notation, recommended move first. */
  line: string[];
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
  /** Whether the winning move is being shown to the player. */
  winMode: boolean;
  /** The move to play, once win mode has found one for this position. */
  hint: WinHint | null;
  /** True while the hint for the current position is still being searched. */
  isHinting: boolean;
  setWinMode: (on: boolean) => void;
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

/**
 * Matches an analysis back onto the game's own legal moves, so the hint carries
 * the piece, the capture and the castling flag that describing it needs.
 * Returns `null` when the position no longer contains that move, which is what
 * a reply that outlived its board looks like.
 */
const toHint = (game: ChessGame, analysis: BotAnalysis): WinHint | null => {
  const move = game
    .getLegalMovesFrom(analysis.move.from)
    .find(
      (candidate) =>
        isSamePosition(candidate.to, analysis.move.to) &&
        candidate.promotion === analysis.move.promotion,
    );
  if (!move) return null;

  return {
    move,
    score: analysis.score,
    mateIn: analysis.mateIn,
    depth: analysis.depth,
    line: analysis.line,
  };
};

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
  const [winMode, setWinMode] = useState(false);
  /**
   * A hint together with the state it was searched for. Holding the two
   * together is what lets `hint` below be derived rather than cleared by hand:
   * a result for any other position simply stops matching.
   */
  const [hintResult, setHintResult] = useState<{
    position: GameState;
    hint: WinHint | null;
  } | null>(null);

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
  /** The same guard for hints, kept apart so the two never invalidate each other. */
  const hintToken = useRef(0);

  useEffect(
    () => () => {
      turnToken.current += 1;
      hintToken.current += 1;
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

  const showsHint =
    winMode &&
    !state.gameOver &&
    state.currentPlayer === PLAYER_COLOR &&
    pendingPromotion === null;
  // Matching on the state the search was given, rather than on a flag cleared
  // by hand, is what stops a hint from ever outliving the board it describes.
  const isHintCurrent = hintResult?.position === state;
  const hint = showsHint && isHintCurrent ? hintResult.hint : null;

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

  /**
   * Win mode: search the position from the player's side whenever it is their
   * turn. `state` is a fresh object after every move, so this re-runs on its
   * own as the game goes on.
   */
  useEffect(() => {
    const token = ++hintToken.current;
    if (!showsHint) return;

    const position = state;
    getRunner()
      .requestAnalysis(game.toFEN())
      .then((analysis) => {
        if (token !== hintToken.current) return;
        setHintResult({ position, hint: analysis ? toHint(game, analysis) : null });
      })
      .catch((error) => {
        console.error('Win mode analysis failed:', error);
      });
  }, [game, getRunner, showsHint, state]);

  return {
    state,
    selected,
    candidateMoves,
    pendingPromotion,
    isThinking,
    difficulty,
    playerColor: PLAYER_COLOR,
    canUndo: state.moveHistory.length > 0 && !isThinking,
    winMode,
    hint,
    isHinting: showsHint && !isHintCurrent,
    setWinMode,
    selectSquare,
    completePromotion,
    cancelPromotion,
    setDifficulty,
    newGame,
    undo,
  };
};
