export type SignalListener<TPayload> = (payload: TPayload) => void;

export class Signal<TPayload> {
  private readonly listeners = new Set<SignalListener<TPayload>>();

  connect(listener: SignalListener<TPayload>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect(listener: SignalListener<TPayload>): void {
    this.listeners.delete(listener);
  }

  clear(): void {
    this.listeners.clear();
  }

  emit(payload: TPayload): void {
    for (const listener of [...this.listeners]) {
      listener(payload);
    }
  }

  get size(): number {
    return this.listeners.size;
  }
}
