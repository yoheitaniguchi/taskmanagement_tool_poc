// テスト用の Storage（localStorage の代わり）。setItem で例外を投げるようにもできる（容量超過などの再現）
export class FakeStorage implements Storage {
  private readonly map = new Map<string, string>();
  failOnWrite = false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failOnWrite) throw new DOMException("quota", "QuotaExceededError");
    this.map.set(key, String(value));
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}
