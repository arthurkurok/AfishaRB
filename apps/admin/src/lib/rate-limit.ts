/**
 * Ограничение попыток входа: не больше N неудачных попыток за окно с одного адреса.
 * Хранится в памяти процесса — защита от перебора токена через форму входа; основной лимит — на стороне API.
 */
export class AttemptLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Сколько секунд ждать до следующей попытки; 0 — можно пробовать. */
  retryAfter(key: string, now: number = Date.now()): number {
    const list = this.recent(key, now);
    if (list.length < this.max) return 0;
    return Math.ceil((this.windowMs - (now - list[0]!)) / 1000);
  }

  fail(key: string, now: number = Date.now()): void {
    this.hits.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }
}
