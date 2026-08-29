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
        className="w-full max-w-xs rounded-2xl bg-slate-100 p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="promotion-heading" className="mb-4 text-center text-lg font-semibold text-slate-800">
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
              className="flex aspect-square items-center justify-center rounded-xl bg-white text-4xl text-slate-900 shadow transition hover:bg-sky-100 active:scale-95"
            >
              <span
                aria-hidden="true"
                className={
                  color === 'white'
                    ? 'text-slate-700 [text-shadow:0_1px_1px_rgba(0,0,0,.25)]'
                    : 'text-slate-900'
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
          className="mt-4 w-full rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
        >
          Cancel move
        </button>
      </div>
    </div>
  );
};
