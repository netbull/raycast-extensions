import { Cache } from "@raycast/api";

import { captureShellEnv } from "./shellEnv";

const ENV_KEY = "shell-env";

const cache = new Cache({ namespace: "spellbook-env" });

let memoryEnv: NodeJS.ProcessEnv | undefined;

export async function getShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (memoryEnv) {
    return memoryEnv;
  }
  const stored = cache.get(ENV_KEY);
  if (stored !== undefined) {
    try {
      memoryEnv = JSON.parse(stored) as NodeJS.ProcessEnv;
      return memoryEnv;
    } catch {
      cache.remove(ENV_KEY);
    }
  }
  const env = await captureShellEnv();
  memoryEnv = env;
  cache.set(ENV_KEY, JSON.stringify(env));
  return env;
}

export function refreshShellEnv(): void {
  memoryEnv = undefined;
  cache.remove(ENV_KEY);
}
