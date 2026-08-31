import { useEffect, useRef } from 'react';
import { PieceColor, PromotionPiece } from './types';
import { PIECE_GLYPH, PIECE_NAMES } from './utils';

interface PromotionDialogProps {
  color: PieceColor;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

const CHOICES: PromotionPiece[] = ['queen', 'rook', 'bishop', 'knight'];

/**
 * Under-promotion is occasionally the only winning move, so the choice is
 * always offered rather than silently defaulting to a queen.
 */
export const PromotionDialog = ({ color, onSelect, onCancel }: PromotionDialogProps) => {
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promotion-heading"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-slate-700 bg-slate-800 p-5 text-slate-100 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="promotion-heading" className="mb-4 text-center text-lg font-semibold text-slate-100">
          Promote your pawn
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {CHOICES.map((piece, index) => (
            <button
              key={piece}
              ref={index === 0 ? firstButtonRef : undefined}
              type="button"
              onClick={() => onSelect(piece)}
              aria-label={`Promote to ${PIECE_NAMES[piece]}`}
              className="flex aspect-square items-center justify-center rounded-xl bg-[#b48761] text-4xl shadow transition hover:bg-sky-400/70 active:scale-95"
            >
              {/* Same treatment as on the board: the filled glyph is tinted
                  rather than swapped, so it reads on the wood tile either way. */}
              <span
                aria-hidden="true"
                className={
                  color === 'white'
                    ? 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,.55),0_0_1px_rgba(0,0,0,.9)]'
                    : 'text-slate-900 [text-shadow:0_1px_1px_rgba(255,255,255,.35)]'
                }
              >
                {PIECE_GLYPH[piece]}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-700 hover:text-slate-100"
        >
          Cancel move
        </button>
      </div>
    </div>
  );
};
