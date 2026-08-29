/// <reference lib="webworker" />
import { ChessGame } from './ChessGame';
import { ChessBot } from './ChessBot';
import { BotRequest, BotResponse } from './botProtocol';

const bot = new ChessBot('medium');

self.onmessage = (event: MessageEvent<BotRequest>) => {
  const { id, fen, difficulty, timeBudgetMs } = event.data;
  const respond = (response: BotResponse) => {
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  };

  try {
    bot.setDifficulty(difficulty);
    const game = new ChessGame(fen, { trackRepetition: false });
    const move = bot.findBestMove(game, timeBudgetMs);
    respond({
      id,
      move: move
        ? { from: move.from, to: move.to, promotion: move.promotion }
        : null,
    });
  } catch (error) {
    respond({ id, move: null, error: String(error) });
  }
};
