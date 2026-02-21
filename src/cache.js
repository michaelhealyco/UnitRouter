// Simple in-memory LRU cache
const crypto = require('crypto');

class Cache {
  constructor(maxSize = 500, ttlMs = 3600000) {
    this.map = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.hits = 0;
    this.misses = 0;
  }

  key(messages, model) {
    return crypto.createHash('md5').update(JSON.stringify({ messages, model })).digest('hex');
  }

  get(messages, model) {
    const k = this.key(messages, model);
    const entry = this.map.get(k);
    if (!entry || Date.now() - entry.ts > this.ttlMs) {
      if (entry) this.map.delete(k);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(messages, model, value) {
    const k = this.key(messages, model);
    if (this.map.size >= this.maxSize) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
    this.map.set(k, { value, ts: Date.now() });
  }

  stats() {
    return { entries: this.map.size, hits: this.hits, misses: this.misses };
  }
}

module.exports = new Cache();
