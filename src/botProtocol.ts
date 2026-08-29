import { Difficulty, Position, PromotionPiece } from './types';

/** The plain, structured-cloneable shape of a move crossing the worker boundary. */
export interface BotMove {
  from: Position;
  to: Position;
  promotion?: PromotionPiece;
}

export interface BotRequest {
  id: number;
  fen: string;
  difficulty: Difficulty;
  /** Optional override so a slow device can be given a shorter leash. */
  timeBudgetMs?: number;
}

export interface BotResponse {
  id: number;
  move: BotMove | null;
  error?: string;
}
