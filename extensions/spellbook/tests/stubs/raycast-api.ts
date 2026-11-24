// In-memory stand-ins for the parts of @raycast/api the non-UI code touches.
// The real module only exists inside Raycast, so vitest aliases the import to this file.

const storage = new Map<string, string>();
const caches = new Map<string, Map<string, string>>();
let preferences: Record<string, unknown> = {};

export function resetRaycastStub(
  nextPreferences: Record<string, unknown> = {},
): void {
  storage.clear();
  for (const entries of caches.values()) {
    entries.clear();
  }
  preferences = nextPreferences;
}

export const LocalStorage = {
  async getItem(key: string): Promise<string | undefined> {
    return storage.get(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    storage.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    storage.delete(key);
  },
  async allItems(): Promise<Record<string, string>> {
    return Object.fromEntries(storage);
  },
};

export class Cache {
  private readonly entries: Map<string, string>;

  constructor(options: { namespace?: string } = {}) {
    const namespace = options.namespace ?? "default";
    this.entries = caches.get(namespace) ?? new Map<string, string>();
    caches.set(namespace, this.entries);
  }

  get(key: string): string | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: string): void {
    this.entries.set(key, value);
  }

  remove(key: string): boolean {
    return this.entries.delete(key);
  }
}

export function getPreferenceValues(): Record<string, unknown> {
  return preferences;
}

export const Action = {
  Style: { Regular: "regular", Destructive: "destructive" },
} as const;
