import { ChessBot } from './ChessBot';
import { ChessGame } from './ChessGame';
import { BotMove, BotRequest, BotResponse } from './botProtocol';
import { Difficulty } from './types';

export interface BotRunner {
  /**
   * Resolves with the bot's move, or `null` if the position has none. Only the
   * most recent request resolves with a move: anything superseded by a newer
   * request resolves to `null`, so a stale reply can never be played onto a
   * board that has moved on.
   */
  requestMove(
    fen: string,
    difficulty: Difficulty,
    timeBudgetMs?: number,
  ): Promise<BotMove | null>;
  dispose(): void;
}

/**
 * Runs the search in a worker so a multi-second think never freezes the board.
 * Falls back to running in place where workers are unavailable (older
 * WebViews, tests, SSR) - correct either way, just less smooth.
 */
export const createBotRunner = (): BotRunner => {
  let nextId = 1;
  let latestId = 0;

  let worker: Worker | null = null;
  if (typeof Worker !== 'undefined') {
    try {
      worker = new Worker(new URL('./bot.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      worker = null;
    }
  }

  interface PendingRequest extends BotRequest {
    resolve: (move: BotMove | null) => void;
  }
  const pending = new Map<number, PendingRequest>();

  const localBot = new ChessBot('medium');

  const runLocally = (
    fen: string,
    difficulty: Difficulty,
    timeBudgetMs: number | undefined,
    id: number,
  ): BotMove | null => {
    localBot.setDifficulty(difficulty);
    const move = localBot.findBestMove(
      new ChessGame(fen, { trackRepetition: false }),
      timeBudgetMs,
    );
    if (id !== latestId || !move) return null;
    return { from: move.from, to: move.to, promotion: move.promotion };
  };

  if (worker) {
    worker.onmessage = (event: MessageEvent<BotResponse>) => {
      const { id, move, error } = event.data;
      const request = pending.get(id);
      pending.delete(id);
      if (error) console.error('Chess bot worker failed:', error);
      request?.resolve(id === latestId ? move : null);
    };

    worker.onerror = (event) => {
      console.error('Chess bot worker error:', event.message);
      worker?.terminate();
      worker = null;
      // Resolving these with `null` would leave the board stuck on the bot's
      // turn with nothing left to drive it, so re-run them here instead. Later
      // requests take the local path because `worker` is now null.
      const stranded = [...pending.values()];
      pending.clear();
      for (const request of stranded) {
        request.resolve(
          runLocally(request.fen, request.difficulty, request.timeBudgetMs, request.id),
        );
      }
    };
  }

  return {
    requestMove(fen, difficulty, timeBudgetMs) {
      const id = nextId++;
      latestId = id;

      if (!worker) {
        // Yield first so the "thinking" indicator gets a chance to paint.
        return new Promise((resolve) => {
          setTimeout(() => resolve(runLocally(fen, difficulty, timeBudgetMs, id)), 0);
        });
      }

      const request: BotRequest = { id, fen, difficulty, timeBudgetMs };
      return new Promise((resolve) => {
        pending.set(id, { ...request, resolve });
        worker?.postMessage(request);
      });
    },

    dispose() {
      // Bump the id so any reply still in flight is treated as stale.
      latestId = nextId++;
      for (const request of pending.values()) request.resolve(null);
      pending.clear();
      worker?.terminate();
      worker = null;
    },
  };
};
