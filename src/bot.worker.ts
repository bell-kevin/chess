/// <reference lib="webworker" />
import { ChessGame } from './ChessGame';
import { ChessBot } from './ChessBot';
import { analysePosition } from './analysis';
import { BotRequest, BotResponse } from './botProtocol';

const bot = new ChessBot('medium');

self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, kind, fen, difficulty, timeBudgetMs } = event.data;
  const respond = (response: BotResponse) => {
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  };

  try {
    if (kind === 'analyse') {
      respond({ id, kind, analysis: analysePosition(fen, timeBudgetMs) });
      return;
    }

    bot.setDifficulty(difficulty);
    const game = new ChessGame(fen, { trackRepetition: false });
    const move = bot.findBestMove(game, timeBudgetMs);
    respond({
      id,
      kind,
      move: move
        ? { from: move.from, to: move.to, promotion: move.promotion }
        : null,
    });
  } catch (error) {
    // Both shapes have to answer, or the caller waits forever on a promise.
    if (kind === 'analyse') respond({ id, kind, analysis: null, error: String(error) });
    else respond({ id, kind, move: null, error: String(error) });
  }
};
