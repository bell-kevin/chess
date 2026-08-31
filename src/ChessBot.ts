import { ChessGame } from './ChessGame';
import { Difficulty, Move, PieceColor, PieceType } from './types';
import { getOppositeColor, PIECE_VALUES } from './utils';

/** Any score at or beyond this magnitude is a forced mate, not an evaluation. */
const MATE_SCORE = 100_000;
const MATE_THRESHOLD = MATE_SCORE - 1000;
const MAX_QUIESCENCE_PLY = 6;

/**
 * Piece-square tables, in board order: row 0 is rank 8, so they read the way a
 * board looks from White's side. Black uses the same tables mirrored vertically.
 * Values follow the Chess Programming Wiki's simplified evaluation function.
 */
const PST: Record<PieceType, number[][]> = {
  pawn: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ],
  knight: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50],
  ],
  bishop: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20],
  ],
  rook: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0],
  ],
  queen: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20],
  ],
  king: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20],
  ],
};

/** In the endgame the king should walk to the centre rather than hide. */
const KING_ENDGAME_PST: number[][] = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
];

interface DifficultyProfile {
  /** Hard ceiling on iterative deepening. */
  maxDepth: number;
  /** Wall-clock budget in milliseconds. */
  timeBudgetMs: number;
  useQuiescence: boolean;
  /**
   * How far below the best score a move may be and still get picked, in
   * centipawns. This is what makes the easier levels beatable without making
   * them play nonsense.
   */
  slackCentipawns: number;
  /** Probability of ignoring the search entirely and playing at random. */
  blunderChance: number;
}

const PROFILES: Record<Difficulty, DifficultyProfile> = {
  'very-easy': { maxDepth: 1, timeBudgetMs: 50, useQuiescence: false, slackCentipawns: Infinity, blunderChance: 1 },
  easy: { maxDepth: 1, timeBudgetMs: 150, useQuiescence: false, slackCentipawns: 250, blunderChance: 0.25 },
  // The step up from easy is a second ply: it answers its own move with your
  // best reply, so it stops hanging pieces outright. Without quiescence it
  // still stops counting after the first recapture, which is what keeps it
  // short of medium.
  casual: { maxDepth: 2, timeBudgetMs: 250, useQuiescence: false, slackCentipawns: 140, blunderChance: 0.12 },
  medium: { maxDepth: 2, timeBudgetMs: 400, useQuiescence: true, slackCentipawns: 60, blunderChance: 0.05 },
  hard: { maxDepth: 4, timeBudgetMs: 1200, useQuiescence: true, slackCentipawns: 0, blunderChance: 0 },
  'very-hard': { maxDepth: 6, timeBudgetMs: 3000, useQuiescence: true, slackCentipawns: 0, blunderChance: 0 },
};

/**
 * Win mode analyses at full strength whatever the game's difficulty is set to:
 * a hint is only worth showing if it is the best move on the board.
 */
const ANALYSIS_MAX_DEPTH = 6;
const ANALYSIS_TIME_BUDGET_MS = 2500;

/** Raised to unwind the search when the time budget runs out. */
class SearchTimeout extends Error {}

/** A root move with its score, and the line behind it while a PV is collected. */
interface RootResult {
  move: Move;
  score: number;
  line?: Move[];
}

/** What `analyse` reports back: the move to play and what it is worth. */
export interface Analysis {
  /** The move to play, taken from the caller's own legal move list. */
  move: Move;
  /** Centipawns from the side to move's point of view; positive favours them. */
  score: number;
  /**
   * Moves until mate: positive when the side to move gives it, negative when
   * they receive it, `null` when the search found no forced mate.
   */
  mateIn: number | null;
  /** The deepest iteration that ran to completion, 0 if none did. */
  depth: number;
  /** The principal variation, recommended move first. */
  line: Move[];
}

/** Reads a search score as a distance to mate, or `null` if it is not one. */
const toMateIn = (score: number): number | null => {
  if (score > MATE_THRESHOLD) return Math.ceil((MATE_SCORE - score) / 2);
  if (score < -MATE_THRESHOLD) return -Math.ceil((MATE_SCORE + score) / 2);
  return null;
};

export interface BotOptions {
  /** Injectable for deterministic tests. */
  random?: () => number;
  /** Overrides the profile's wall-clock budget. */
  timeBudgetMs?: number;
}

/**
 * A negamax search with alpha-beta pruning, iterative deepening, quiescence and
 * MVV-LVA move ordering.
 *
 * The search runs directly on a private clone using make/unmake, so it never
 * touches the caller's game and never allocates a board per node.
 */
export class ChessBot {
  private difficulty: Difficulty;
  private readonly random: () => number;
  private readonly timeBudgetOverride?: number;

  private game!: ChessGame;
  private deadline = 0;
  private nodes = 0;
  /** Two killer moves per ply: quiet moves that caused a cutoff at that depth. */
  private killers: (Move | null)[][] = [];
  /** Triangular table of principal variations: `pv[ply]` is the line from there. */
  private pv: Move[][] = [];
  /** Only `analyse` needs the line, so playing a move does not pay for it. */
  private collectPv = false;

  constructor(difficulty: Difficulty = 'medium', options: BotOptions = {}) {
    this.difficulty = difficulty;
    this.random = options.random ?? Math.random;
    this.timeBudgetOverride = options.timeBudgetMs;
  }

  public setDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
  }

  public getDifficulty(): Difficulty {
    return this.difficulty;
  }

  /**
   * Picks a move for whichever side is to move. Returns `null` only when the
   * position has no legal moves at all. `timeBudgetMs` overrides the
   * difficulty's own budget for this call, which lets a slow device be given a
   * shorter leash without changing the difficulty.
   */
  public findBestMove(game: ChessGame, timeBudgetMs?: number): Move | null {
    const profile = PROFILES[this.difficulty];
    const rootMoves = game.getLegalMoves(game.getCurrentPlayer());
    if (rootMoves.length === 0) return null;
    if (rootMoves.length === 1) return rootMoves[0];

    if (this.difficulty === 'very-easy') {
      return this.pickRandom(rootMoves);
    }
    if (profile.blunderChance > 0 && this.random() < profile.blunderChance) {
      return this.pickRandom(rootMoves);
    }

    // Search a private copy so an aborted search can never leave the caller's
    // game half-way through a move.
    this.game = game.clone({ trackRepetition: false });
    this.nodes = 0;
    this.deadline =
      Date.now() +
      (timeBudgetMs ?? this.timeBudgetOverride ?? profile.timeBudgetMs);
    this.killers = Array.from({ length: profile.maxDepth + MAX_QUIESCENCE_PLY + 2 }, () => [
      null,
      null,
    ]);

    const searchMoves = this.orderMoves(
      this.game.getLegalMoves(this.game.getCurrentPlayer()),
      0,
    );
    let scored: RootResult[] = searchMoves.map((move, index) => ({
      move,
      // Descending so the heuristic order survives the first stable sort.
      score: -index,
    }));
    let searchCompleted = false;

    for (let depth = 1; depth <= profile.maxDepth; depth++) {
      try {
        // Only adopt a depth that finished: a partial iteration is unreliable.
        scored = this.searchRoot(depth, scored, profile.useQuiescence);
        searchCompleted = true;
      } catch (error) {
        if (error instanceof SearchTimeout) break;
        throw error;
      }
      // A forced mate is found; deeper search cannot improve on it.
      if (Math.abs(scored[0].score) > MATE_THRESHOLD) break;
    }

    // Without a completed iteration the scores are just the ordering heuristic,
    // so take its first move rather than sampling meaningless numbers.
    if (!searchCompleted) return this.toCallerMove(scored[0].move, rootMoves);

    const best = scored[0].score;
    const acceptable = scored.filter(
      (entry) => best - entry.score <= profile.slackCentipawns,
    );
    const chosen = this.pickRandom(acceptable.length ? acceptable : scored).move;

    return this.toCallerMove(chosen, rootMoves);
  }

  /**
   * The search ran on a clone, so map its result back onto the caller's own move
   * objects to keep piece identity meaningful for the UI.
   */
  private toCallerMove(chosen: Move, rootMoves: Move[]): Move {
    return rootMoves.find((move) => this.sameMove(move, chosen)) ?? rootMoves[0];
  }


  /**
   * Searches at full strength and reports what it found: the move to play, how
   * the position stands after it, and the line it expects to follow. Unlike
   * `findBestMove` this ignores the configured difficulty and never randomises
   * among near-equal moves - a hint that is only the bot's idea of a good move
   * would be worse than no hint at all.
   *
   * Returns `null` only when the position has no legal moves.
   */
  public analyse(
    game: ChessGame,
    options: { maxDepth?: number; timeBudgetMs?: number } = {},
  ): Analysis | null {
    const rootMoves = game.getLegalMoves(game.getCurrentPlayer());
    if (rootMoves.length === 0) return null;

    const maxDepth = options.maxDepth ?? ANALYSIS_MAX_DEPTH;

    this.game = game.clone({ trackRepetition: false });
    this.nodes = 0;
    this.deadline =
      Date.now() +
      (options.timeBudgetMs ?? this.timeBudgetOverride ?? ANALYSIS_TIME_BUDGET_MS);
    this.killers = Array.from({ length: maxDepth + MAX_QUIESCENCE_PLY + 2 }, () => [
      null,
      null,
    ]);
    this.pv = [];
    this.collectPv = true;

    let scored: RootResult[] = this.orderMoves(
      this.game.getLegalMoves(this.game.getCurrentPlayer()),
      0,
    ).map((move, index) => ({ move, score: -index, line: [move] }));
    let depthReached = 0;

    try {
      for (let depth = 1; depth <= maxDepth; depth++) {
        try {
          scored = this.searchRoot(depth, scored, true);
          depthReached = depth;
        } catch (error) {
          if (error instanceof SearchTimeout) break;
          throw error;
        }
        // A forced mate is found; deeper search cannot improve on it.
        if (Math.abs(scored[0].score) > MATE_THRESHOLD) break;
      }
    } finally {
      this.collectPv = false;
    }

    const best = scored[0];
    // Without a completed iteration the score is just the ordering heuristic,
    // so report the static evaluation rather than a meaningless number.
    const searched = depthReached > 0;

    return {
      move: this.toCallerMove(best.move, rootMoves),
      score: searched ? best.score : this.evaluate(game.getCurrentPlayer(), game),
      mateIn: searched ? toMateIn(best.score) : null,
      depth: depthReached,
      line: best.line ?? [best.move],
    };
  }

  private pickRandom<T>(items: T[]): T {
    return items[Math.floor(this.random() * items.length) % items.length];
  }

  /**
   * One iteration of iterative deepening. Previous scores order the root moves,
   * which is where move ordering pays off most.
   *
   * Every root move is searched with a full window. Narrowing it with alpha
   * would prune faster, but then a move that fails low comes back as a *bound*
   * pinned at alpha rather than its real score - and the easier difficulties
   * pick among moves within a few centipawns of the best, so they would happily
   * choose a losing move that merely reported a tying bound. Exact root scores
   * are worth more here than the extra pruning; the plies below still get the
   * full benefit of alpha-beta.
   */
  private searchRoot(
    depth: number,
    previous: RootResult[],
    useQuiescence: boolean,
  ): RootResult[] {
    const ordered = [...previous].sort((a, b) => b.score - a.score);
    const results: RootResult[] = [];

    for (const { move } of ordered) {
      this.game.applyMove(move);
      let score: number;
      try {
        score = -this.negamax(depth - 1, -Infinity, Infinity, 1, useQuiescence);
      } finally {
        this.game.revertMove();
      }
      results.push(
        this.collectPv ? { move, score, line: [move, ...this.pv[1]] } : { move, score },
      );
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private negamax(
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    useQuiescence: boolean,
  ): number {
    this.checkTime();
    // Cleared before any of this node's returns, so a parent that reads it back
    // after a losing move never picks up a sibling's stale line.
    if (this.collectPv) this.pv[ply] = [];

    // Repetition is not tracked on the search clone, but the fifty-move rule and
    // dead positions are both cheap and worth knowing about.
    if (this.game.getHalfmoveClock() >= 100 || this.game.hasInsufficientMaterial()) {
      return 0;
    }

    const color = this.game.getCurrentPlayer();
    const moves = this.game.getLegalMoves(color);

    if (moves.length === 0) {
      // Prefer the fastest mate, and the slowest loss, by folding in the ply.
      return this.game.isKingInCheck(color) ? -MATE_SCORE + ply : 0;
    }

    if (depth <= 0) {
      return useQuiescence
        ? this.quiescence(alpha, beta, ply, 0)
        : this.evaluate(color);
    }

    let best = -Infinity;
    for (const move of this.orderMoves(moves, ply)) {
      this.game.applyMove(move);
      let score: number;
      try {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, useQuiescence);
      } finally {
        this.game.revertMove();
      }

      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        if (this.collectPv) this.pv[ply] = [move, ...this.pv[ply + 1]];
      }
      if (alpha >= beta) {
        if (!move.capturedPiece && !move.promotion) this.rememberKiller(move, ply);
        break;
      }
    }

    return best;
  }

  /**
   * Extends the search along captures and promotions only, so the evaluation is
   * never taken in the middle of a trade. Without this the bot happily grabs a
   * pawn with its queen on the last ply of the search.
   */
  private quiescence(
    alpha: number,
    beta: number,
    ply: number,
    qDepth: number,
  ): number {
    this.checkTime();
    if (this.collectPv) this.pv[ply] = [];

    const color = this.game.getCurrentPlayer();
    const inCheck = this.game.isKingInCheck(color);
    const moves = this.game.getLegalMoves(color);

    if (moves.length === 0) return inCheck ? -MATE_SCORE + ply : 0;

    const standPat = this.evaluate(color);
    if (qDepth >= MAX_QUIESCENCE_PLY) return standPat;
    if (!inCheck) {
      if (standPat >= beta) return standPat;
      // Standing pat leaves `pv[ply]` empty on purpose: the line ends here,
      // with the side to move declining to capture further.
      if (standPat > alpha) alpha = standPat;
    }

    // Escaping check is forced, so every reply has to be considered there.
    const candidates = inCheck
      ? moves
      : moves.filter((move) => move.capturedPiece || move.promotion);

    let best = inCheck ? -Infinity : standPat;
    for (const move of this.orderMoves(candidates, ply)) {
      this.game.applyMove(move);
      let score: number;
      try {
        score = -this.quiescence(-beta, -alpha, ply + 1, qDepth + 1);
      } finally {
        this.game.revertMove();
      }
      if (score > best) best = score;
      if (score > alpha) {
        alpha = score;
        if (this.collectPv) this.pv[ply] = [move, ...this.pv[ply + 1]];
      }
      if (alpha >= beta) break;
    }

    return best;
  }

  private rememberKiller(move: Move, ply: number): void {
    const slot = this.killers[ply];
    if (!slot) return;
    if (slot[0] && this.sameMove(slot[0], move)) return;
    slot[1] = slot[0];
    slot[0] = move;
  }

  private sameMove(a: Move, b: Move): boolean {
    return (
      a.from.row === b.from.row &&
      a.from.col === b.from.col &&
      a.to.row === b.to.row &&
      a.to.col === b.to.col &&
      a.promotion === b.promotion
    );
  }

  /**
   * Orders by most-valuable-victim / least-valuable-attacker, then promotions,
   * then killer moves. Good ordering is what makes alpha-beta actually prune.
   */
  private orderMoves(moves: Move[], ply: number): Move[] {
    const killers = this.killers[ply] ?? [null, null];
    return [...moves].sort((a, b) => this.moveScore(b, killers) - this.moveScore(a, killers));
  }

  private moveScore(move: Move, killers: (Move | null)[]): number {
    let score = 0;
    if (move.capturedPiece) {
      score +=
        10_000 +
        PIECE_VALUES[move.capturedPiece.type] * 10 -
        PIECE_VALUES[move.piece.type];
    }
    if (move.promotion) score += 9_000 + PIECE_VALUES[move.promotion];
    if (move.castling) score += 500;
    if (!move.capturedPiece && !move.promotion) {
      if (killers[0] && this.sameMove(killers[0], move)) score += 900;
      else if (killers[1] && this.sameMove(killers[1], move)) score += 800;
    }
    return score;
  }

  /**
   * Static evaluation from `color`'s point of view: material, piece-square
   * tables, bishop pair and pawn structure. Positive means `color` is better.
   */
  public evaluate(color: PieceColor, game: ChessGame = this.game): number {
    let white = 0;
    let black = 0;
    let nonPawnMaterial = 0;

    const bishops: Record<PieceColor, number> = { white: 0, black: 0 };
    // Pawn counts per file, used for doubled and isolated pawn penalties.
    const pawnFiles: Record<PieceColor, number[]> = {
      white: new Array(8).fill(0),
      black: new Array(8).fill(0),
    };

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = game.readSquare(row, col);
        if (!piece) continue;
        if (piece.type === 'pawn') pawnFiles[piece.color][col] += 1;
        if (piece.type === 'bishop') bishops[piece.color] += 1;
        if (piece.type !== 'pawn' && piece.type !== 'king') {
          nonPawnMaterial += PIECE_VALUES[piece.type];
        }
      }
    }

    // Below roughly a queen and a rook of non-pawn material each, king safety
    // stops mattering and king activity starts to.
    const isEndgame = nonPawnMaterial <= 2600;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = game.readSquare(row, col);
        if (!piece) continue;

        const tableRow = piece.color === 'white' ? row : 7 - row;
        const table =
          piece.type === 'king' && isEndgame ? KING_ENDGAME_PST : PST[piece.type];
        let value = PIECE_VALUES[piece.type] + table[tableRow][col];

        if (piece.type === 'pawn') {
          const files = pawnFiles[piece.color];
          if (files[col] > 1) value -= 12; // doubled
          const hasNeighbour =
            (col > 0 && files[col - 1] > 0) || (col < 7 && files[col + 1] > 0);
          if (!hasNeighbour) value -= 18; // isolated
          if (this.isPassedPawn(row, col, piece.color, game)) {
            const rank = piece.color === 'white' ? 7 - row : row;
            value += 12 * rank;
          }
        }

        if (piece.color === 'white') white += value;
        else black += value;
      }
    }

    if (bishops.white >= 2) white += 35;
    if (bishops.black >= 2) black += 35;

    const score = white - black;
    return color === 'white' ? score : -score;
  }

  /** No enemy pawn ahead of it on its own or an adjacent file. */
  private isPassedPawn(
    row: number,
    col: number,
    color: PieceColor,
    game: ChessGame,
  ): boolean {
    const direction = color === 'white' ? -1 : 1;
    const enemy = getOppositeColor(color);
    for (let r = row + direction; r >= 0 && r <= 7; r += direction) {
      for (let c = Math.max(0, col - 1); c <= Math.min(7, col + 1); c++) {
        const piece = game.readSquare(r, c);
        if (piece?.type === 'pawn' && piece.color === enemy) return false;
      }
    }
    return true;
  }

  private checkTime(): void {
    this.nodes += 1;
    // Polling the clock every node is itself measurable, so sample it.
    if ((this.nodes & 1023) === 0 && Date.now() > this.deadline) {
      throw new SearchTimeout();
    }
  }
}
