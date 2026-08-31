import { describe, expect, it } from 'vitest';
import { createBotRunner } from '../botRunner';
import { STARTING_FEN } from '../ChessGame';
import { getSquareName } from '../utils';

/**
 * There is no `Worker` under vitest, so these exercise the in-process path the
 * runner falls back to - which is the same code an old WebView would take.
 */
describe('bot runner', () => {
  const MATE_IN_ONE = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';

  it('serves hints and bot moves without either shadowing the other', async () => {
    const runner = createBotRunner();

    const hint = await runner.requestAnalysis(MATE_IN_ONE, 200);
    expect(hint).not.toBeNull();
    expect(getSquareName(hint!.move.from)).toBe('a1');
    expect(getSquareName(hint!.move.to)).toBe('a8');
    expect(hint!.line[0]).toBe('Ra8#');

    // The two are tracked apart, so asking for a hint must never leave the
    // bot's own reply looking stale - that would strand the board on its turn.
    const move = await runner.requestMove(MATE_IN_ONE, 'hard', 200);
    expect(move).not.toBeNull();

    runner.dispose();
  });

  it('drops a superseded request rather than answering for an old board', async () => {
    const runner = createBotRunner();

    const stale = runner.requestMove(STARTING_FEN, 'medium', 50);
    const current = runner.requestMove(MATE_IN_ONE, 'medium', 50);

    expect(await stale).toBeNull();
    expect(await current).not.toBeNull();

    runner.dispose();
  });

  it('resolves whatever is outstanding when it is disposed', async () => {
    const runner = createBotRunner();
    const move = runner.requestMove(STARTING_FEN, 'medium', 50);
    const hint = runner.requestAnalysis(STARTING_FEN, 50);

    runner.dispose();

    expect(await move).toBeNull();
    expect(await hint).toBeNull();
  });
});
