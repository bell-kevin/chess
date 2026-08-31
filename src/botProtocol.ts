import { Difficulty, Position, PromotionPiece } from './types';

/** The plain, structured-cloneable shape of a move crossing the worker boundary. */
export interface BotMove {
  from: Position;
  to: Position;
  promotion?: PromotionPiece;
}

/**
 * A win-mode hint: the strongest move in a position and what the search saw
 * behind it. Everything here is plain data, so it survives the worker boundary.
 */
export interface BotAnalysis {
  move: BotMove;
  /** Centipawns from the side to move's point of view; positive favours them. */
  score: number;
  /** Moves to mate: positive gives it, negative receives it, `null` for neither. */
  mateIn: number | null;
  /** How deep the search got, in plies. */
  depth: number;
  /** The expected continuation in algebraic notation, recommended move first. */
  line: string[];
}

/**
 * `'move'` asks the bot to play; `'analyse'` asks what the side to move should
 * play. The two are tracked separately, so a hint request can never make the
 * bot's own reply look stale.
 */
export type BotRequestKind = 'move' | 'analyse';

export interface BotRequest {
  id: number;
  kind: BotRequestKind;
  fen: string;
  /** Ignored by `'analyse'`, which always searches at full strength. */
  difficulty: Difficulty;
  /** Optional override so a slow device can be given a shorter leash. */
  timeBudgetMs?: number;
}

export type BotResponse =
  | { id: number; kind: 'move'; move: BotMove | null; error?: string }
  | { id: number; kind: 'analyse'; analysis: BotAnalysis | null; error?: string };
