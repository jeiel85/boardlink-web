// Generic AI engine for the same-device (vs-computer) mode.
// A `GameBrain` adapts a specific game to alpha-beta minimax: it tells the engine
// whose turn it is, how to score a position, and which candidate commands to try.
// The engine drives search purely through the GameModule's own rules
// (enumerateCommands / decide / evolve / evaluateResult), so there is no rule
// duplication. Difficulty maps to search depth (+ randomness on Easy).
//
// Pure TypeScript; no Cloudflare/React/Node imports. Randomness is injected as an
// rng function so callers can seed it for reproducibility.

import type { AnyGameModule, GameActor } from '@boardlink/protocol';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Magnitude returned for a won/lost terminal position. Far larger than any
// heuristic so a forced win/loss always dominates the search.
export const TERMINAL_SCORE = 1e7;

export interface GameBrain {
  // Which seat is to move in this state.
  seatToMove(state: unknown): number;
  // Build the actor object for a seat (used to enumerate / apply commands).
  actorFor(state: unknown, seat: number): GameActor;
  // Heuristic value of a non-terminal position, from `seat`'s point of view
  // (higher = better for `seat`).
  evaluate(state: unknown, seat: number): number;
  // Score a terminal position (module.evaluateResult(state) returned non-null),
  // from `seat`'s point of view.
  scoreTerminal(result: unknown, state: unknown, seat: number): number;
  // Candidate commands to search for `seat`, optionally narrowed/ordered.
  moves(module: AnyGameModule, state: unknown, seat: number): unknown[];
  // Optional per-game difficulty tuning.
  difficulty?(d: Difficulty): { depth: number; randomness: number };
}

export interface AiController {
  seatToMove(state: unknown): number;
  chooseCommand(args: {
    state: unknown;
    seat: number;
    difficulty: Difficulty;
    rng: () => number;
  }): unknown | null;
}

const DEFAULT_DIFFICULTY: Record<Difficulty, { depth: number; randomness: number }> = {
  easy: { depth: 1, randomness: 0.5 },
  medium: { depth: 2, randomness: 0 },
  hard: { depth: 3, randomness: 0 },
};

function applyCommand(
  module: AnyGameModule,
  state: unknown,
  command: unknown,
  actor: GameActor,
): unknown {
  const events = module.decide({ state, actor, command, serverReceivedAtMs: 0 });
  let next = state;
  for (const event of events) next = module.evolve(next, event);
  return next;
}

// Minimax with alpha-beta pruning. Scores are always from `aiSeat`'s point of
// view: the AI maximizes on its own turn and the opponent minimizes.
function minimax(
  module: AnyGameModule,
  brain: GameBrain,
  state: unknown,
  aiSeat: number,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const result = module.evaluateResult(state);
  if (result) return brain.scoreTerminal(result, state, aiSeat);
  if (depth <= 0) return brain.evaluate(state, aiSeat);

  const toMove = brain.seatToMove(state);
  const moves = brain.moves(module, state, toMove);
  if (moves.length === 0) return brain.evaluate(state, aiSeat);
  const actor = brain.actorFor(state, toMove);

  if (toMove === aiSeat) {
    let best = -Infinity;
    let a = alpha;
    for (const move of moves) {
      const child = applyCommand(module, state, move, actor);
      const v = minimax(module, brain, child, aiSeat, depth - 1, a, beta);
      if (v > best) best = v;
      if (best > a) a = best;
      if (a >= beta) break;
    }
    return best;
  }

  let best = Infinity;
  let b = beta;
  for (const move of moves) {
    const child = applyCommand(module, state, move, actor);
    const v = minimax(module, brain, child, aiSeat, depth - 1, alpha, b);
    if (v < best) best = v;
    if (best < b) b = best;
    if (b <= alpha) break;
  }
  return best;
}

export function minimaxController(module: AnyGameModule, brain: GameBrain): AiController {
  const tune = brain.difficulty ?? ((d: Difficulty) => DEFAULT_DIFFICULTY[d]);
  return {
    seatToMove: (state) => brain.seatToMove(state),
    chooseCommand: ({ state, seat, difficulty, rng }) => {
      const { depth, randomness } = tune(difficulty);
      const moves = brain.moves(module, state, seat);
      if (moves.length === 0) return null;
      // Easy: sometimes just play a random legal move.
      if (randomness > 0 && rng() < randomness) {
        return moves[Math.floor(rng() * moves.length)];
      }
      const actor = brain.actorFor(state, seat);
      let best = -Infinity;
      let bestMoves: unknown[] = [];
      for (const move of moves) {
        const child = applyCommand(module, state, move, actor);
        const v = minimax(module, brain, child, seat, depth - 1, -Infinity, Infinity);
        if (v > best) {
          best = v;
          bestMoves = [move];
        } else if (v === best) {
          bestMoves.push(move);
        }
      }
      return bestMoves[Math.floor(rng() * bestMoves.length)] ?? moves[0];
    },
  };
}
