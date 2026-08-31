import { Loader2, Target } from 'lucide-react';
import { Move } from './types';
import { WinHint } from './useChessGame';
import { getSquareName, PIECE_NAMES } from './utils';

interface WinModePanelProps {
  enabled: boolean;
  hint: WinHint | null;
  /** True while the hint for this position is still being searched. */
  isHinting: boolean;
  /** The bot is on the clock, so there is nothing to recommend yet. */
  isPlayersTurn: boolean;
  gameOver: boolean;
  onToggle: (on: boolean) => void;
}

/**
 * The recommended move in words. Notation is the compact form and is shown
 * alongside, but "move your knight from g1 to f3" is the part a player who has
 * never read a scoresheet can act on.
 */
const describeMove = (move: Move): string => {
  if (move.castling) {
    const side = move.castling === 'kingside' ? 'kingside' : 'queenside';
    return `Castle ${side}: your king goes to ${getSquareName(move.to)}.`;
  }

  const taking = move.enPassant
    ? ', taking the pawn in passing'
    : move.capturedPiece
      ? `, taking the ${PIECE_NAMES[move.capturedPiece.type]}`
      : '';
  const promoting = move.promotion
    ? `, and promote it to a ${PIECE_NAMES[move.promotion]}`
    : '';

  return `Move your ${PIECE_NAMES[move.piece.type]} from ${getSquareName(
    move.from,
  )} to ${getSquareName(move.to)}${taking}${promoting}.`;
};

/** One decimal and always a sign, the way engines report an advantage. */
const formatScore = (centipawns: number): string =>
  `${centipawns >= 0 ? '+' : '-'}${(Math.abs(centipawns) / 100).toFixed(1)}`;

/**
 * What the move is worth, in words. Win mode should say plainly when a position
 * is not winning: a hint that implied every move was a winning one would be
 * lying to the player about the game they are in.
 */
const describeVerdict = (hint: WinHint): { text: string; tone: string } => {
  if (hint.mateIn !== null) {
    if (hint.mateIn === 1) {
      return { text: 'This is checkmate.', tone: 'text-emerald-300' };
    }
    if (hint.mateIn > 1) {
      return {
        text: `Checkmate in ${hint.mateIn} — the bot cannot escape it.`,
        tone: 'text-emerald-300',
      };
    }
    return {
      text: `The bot mates in ${Math.abs(hint.mateIn)}; this holds out longest.`,
      tone: 'text-rose-300',
    };
  }

  const score = formatScore(hint.score);
  if (hint.score >= 300) {
    return { text: `Winning — ${score} after this move.`, tone: 'text-emerald-300' };
  }
  if (hint.score >= 100) {
    return { text: `Ahead — ${score} after this move.`, tone: 'text-emerald-200' };
  }
  if (hint.score > -100) {
    return { text: `Level at ${score}; this keeps the balance.`, tone: 'text-slate-300' };
  }
  if (hint.score > -300) {
    return { text: `Behind at ${score}; this is the best chance.`, tone: 'text-amber-200' };
  }
  return { text: `Losing at ${score}; this defends longest.`, tone: 'text-rose-300' };
};

/**
 * Win mode: the switch, and the move it recommends while it is on. The board
 * draws the same move as an arrow, so this panel carries the reasoning rather
 * than repeating the geometry.
 */
export const WinModePanel = ({
  enabled,
  hint,
  isHinting,
  isPlayersTurn,
  gameOver,
  onToggle,
}: WinModePanelProps) => {
  const verdict = hint ? describeVerdict(hint) : null;

  return (
    <section
      aria-label="Win mode"
      className={`rounded-xl border p-3 transition-colors ${
        enabled ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/40'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        className="flex w-full items-center gap-2 text-left"
      >
        <Target
          className={`h-4 w-4 shrink-0 ${enabled ? 'text-emerald-300' : 'text-slate-400'}`}
          aria-hidden="true"
        />
        <span className="flex-1 text-sm font-semibold text-slate-100">Win mode</span>
        {/* A pill rather than a checkbox: it reads as on/off at a glance and
            still carries its state through `aria-pressed` above. */}
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
            enabled ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-300'
          }`}
        >
          {enabled ? 'On' : 'Off'}
        </span>
      </button>

      {!enabled && (
        <p className="mt-2 text-xs text-slate-400">
          Shows you which piece to move where, at full engine strength.
        </p>
      )}

      {enabled && (
        <div className="mt-3" aria-live="polite">
          {gameOver ? (
            <p className="text-xs text-slate-400">
              The game is over. Start a new one for your next hint.
            </p>
          ) : !isPlayersTurn ? (
            <p className="text-xs text-slate-400">Waiting for the bot to move…</p>
          ) : isHinting ? (
            <p className="flex items-center gap-2 text-xs text-slate-300">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
              Finding your best move…
            </p>
          ) : hint ? (
            <>
              <p className="font-mono text-2xl font-bold leading-none text-emerald-300">
                {hint.line[0] ??
                  `${getSquareName(hint.move.from)}–${getSquareName(hint.move.to)}`}
              </p>
              <p className="mt-2 text-sm text-slate-200">{describeMove(hint.move)}</p>
              <p className={`mt-2 text-xs font-semibold ${verdict?.tone}`}>
                {verdict?.text}
              </p>
              {hint.line.length > 1 && (
                <p className="mt-2 text-xs text-slate-400">
                  <span className="font-semibold uppercase tracking-wider">Then</span>{' '}
                  <span className="font-mono text-slate-300">
                    {hint.line.slice(1, 6).join(' ')}
                  </span>
                </p>
              )}
              {hint.depth > 0 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Searched {hint.depth} plies deep, ignoring the difficulty setting.
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-400">No move to recommend here.</p>
          )}
        </div>
      )}
    </section>
  );
};
