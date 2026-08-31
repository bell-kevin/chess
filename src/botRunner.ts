import { analysePosition } from './analysis';
import { ChessBot } from './ChessBot';
import { ChessGame } from './ChessGame';
import { BotAnalysis, BotMove, BotRequest, BotResponse } from './botProtocol';
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
  /**
   * Resolves with the strongest move in the position and what the search made
   * of it - win mode's hint. Superseded requests resolve to `null` exactly as
   * `requestMove` does.
   */
  requestAnalysis(fen: string, timeBudgetMs?: number): Promise<BotAnalysis | null>;
  dispose(): void;
}

/** What either kind of request resolves with. */
type BotResult = BotMove | BotAnalysis | null;

const spawnWorker = (): Worker | null => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
};

interface Channel {
  /** Sends a request, superseding anything still in flight on this channel. */
  send(request: Omit<BotRequest, 'id'>): Promise<BotResult>;
  dispose(): void;
}

interface ChannelOptions {
  /**
   * Throw the worker away when a request supersedes one still running. A search
   * cannot be interrupted from outside, so this is the only way to stop one
   * early - worth it for hints, where the answer is already worthless, and not
   * for the bot's own move, which is superseded only when the player resets the
   * board.
   */
  restartWhenSuperseded: boolean;
}

/**
 * One stream of requests on its own worker. The bot's moves and win mode's
 * hints get a channel each: a worker handles one message at a time, so sharing
 * one would let a hint the player has already moved past hold the bot's reply
 * up for seconds.
 *
 * The worker is spawned on the first request, so a player who never turns win
 * mode on never pays for its channel.
 */
const createChannel = ({ restartWhenSuperseded }: ChannelOptions): Channel => {
  let nextId = 1;
  let latest = 0;
  let worker: Worker | null = null;
  let spawned = false;

  interface PendingRequest {
    request: BotRequest;
    resolve: (result: BotResult) => void;
  }
  const pending = new Map<number, PendingRequest>();

  const localBot = new ChessBot('medium');

  /**
   * Runs the search in place, for browsers without workers and for requests
   * stranded by a worker that has failed.
   */
  const runLocally = (request: BotRequest): BotResult => {
    const { id, kind, fen, difficulty, timeBudgetMs } = request;

    let result: BotResult;
    if (kind === 'analyse') {
      result = analysePosition(fen, timeBudgetMs);
    } else {
      localBot.setDifficulty(difficulty);
      const move = localBot.findBestMove(
        new ChessGame(fen, { trackRepetition: false }),
        timeBudgetMs,
      );
      result = move ? { from: move.from, to: move.to, promotion: move.promotion } : null;
    }

    // Judged after the search rather than before it: the position can move on
    // while it runs, and a result for the wrong board is worse than none.
    return id === latest ? result : null;
  };

  const listen = (instance: Worker) => {
    instance.onmessage = (event: MessageEvent<BotResponse>) => {
      const response = event.data;
      const entry = pending.get(response.id);
      pending.delete(response.id);
      if (response.error) console.error('Chess bot worker failed:', response.error);

      const result = response.kind === 'analyse' ? response.analysis : response.move;
      entry?.resolve(response.id === latest ? result : null);
    };

    instance.onerror = (event) => {
      console.error('Chess bot worker error:', event.message);
      instance.terminate();
      if (worker === instance) worker = null;
      // Resolving these with `null` would leave the board stuck on the bot's
      // turn with nothing left to drive it, so re-run them here instead. Later
      // requests take the local path because `worker` is now null.
      const stranded = [...pending.values()];
      pending.clear();
      for (const entry of stranded) entry.resolve(runLocally(entry.request));
    };
  };

  const getWorker = (): Worker | null => {
    if (!spawned) {
      spawned = true;
      worker = spawnWorker();
      if (worker) listen(worker);
    }
    return worker;
  };

  /** Drops every request in flight, resolving each as stale. */
  const abandon = () => {
    for (const entry of pending.values()) entry.resolve(null);
    pending.clear();
  };

  return {
    send(draft) {
      const request: BotRequest = { ...draft, id: nextId++ };
      latest = request.id;

      let active = getWorker();
      if (active && restartWhenSuperseded && pending.size > 0) {
        active.terminate();
        abandon();
        worker = spawnWorker();
        active = worker;
        if (active) listen(active);
      }

      if (!active) {
        // Yield first so the "thinking" indicator gets a chance to paint.
        return new Promise((resolve) => {
          setTimeout(() => resolve(runLocally(request)), 0);
        });
      }

      const instance = active;
      return new Promise((resolve) => {
        pending.set(request.id, { request, resolve });
        instance.postMessage(request);
      });
    },

    dispose() {
      // Bump the id so any reply still in flight is treated as stale.
      latest = nextId++;
      abandon();
      worker?.terminate();
      worker = null;
      // Left `spawned`, so a disposed runner never quietly starts a new worker.
      spawned = true;
    },
  };
};

/**
 * Runs the search in a worker so a multi-second think never freezes the board.
 * Falls back to running in place where workers are unavailable (older
 * WebViews, tests, SSR) - correct either way, just less smooth.
 */
export const createBotRunner = (): BotRunner => {
  const moves = createChannel({ restartWhenSuperseded: false });
  const hints = createChannel({ restartWhenSuperseded: true });

  return {
    requestMove(fen, difficulty, timeBudgetMs) {
      return moves.send({ kind: 'move', fen, difficulty, timeBudgetMs }) as Promise<
        BotMove | null
      >;
    },

    requestAnalysis(fen, timeBudgetMs) {
      // The difficulty is carried for the shape of the request only: a hint is
      // always searched at full strength.
      return hints.send({
        kind: 'analyse',
        fen,
        difficulty: 'very-hard',
        timeBudgetMs,
      }) as Promise<BotAnalysis | null>;
    },

    dispose() {
      moves.dispose();
      hints.dispose();
    },
  };
};
