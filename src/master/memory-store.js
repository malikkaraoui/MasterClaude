// memory-store.js — no-op (Ollama embeddings supprimés)
export class MemoryStore {
  async store() {}
  async retrieve() { return ''; }
}
