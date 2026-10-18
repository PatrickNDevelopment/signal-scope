/** The no-look-ahead assertion (docs/spec/00-data-and-time.md rule 5). */

export class LookaheadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookaheadError';
  }
}

/**
 * Throws when any input was not available at the decision. `decision` is the session date at whose
 * close the decision is made; every `used` date must be <= decision (series points) and every event
 * anchor must be <= decision.
 */
export function assertNoLookahead(
  context: string,
  decision: string,
  used: readonly string[],
): void {
  for (const d of used) {
    if (d > decision) {
      throw new LookaheadError(
        `${context}: used information dated ${d} for a decision on ${decision}`,
      );
    }
  }
}

/** Entry must be strictly after the signal session. */
export function assertEntryAfterSignal(context: string, signal: string, entry: string): void {
  if (!(entry > signal)) {
    throw new LookaheadError(`${context}: entry ${entry} is not after the signal ${signal}`);
  }
}
