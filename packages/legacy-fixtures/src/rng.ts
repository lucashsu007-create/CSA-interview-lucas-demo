/**
 * A seeded, deterministic pseudo-random source.
 *
 * Determinism is not a nicety here. The whole harness is judged by a
 * reconciliation, and a reconciliation compares a count taken at extract time
 * against a count taken after the load. If the corpus changed between two runs,
 * a green comparison would prove nothing and a red one would be unattributable.
 *
 * mulberry32: 32 bits of state, uniform enough for fixtures, and short enough to
 * read. Nothing here is cryptographic and nothing here should ever be — the
 * ticket signer owns that, with a real CSPRNG.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // A zero seed leaves mulberry32 stuck, so fold it away.
    this.state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`empty range [${min}, ${max}]`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability `p`. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** One element, never undefined for a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("pick from an empty array");
    return items[this.int(0, items.length - 1)] as T;
  }

  /** A copy shuffled in place by Fisher-Yates. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
