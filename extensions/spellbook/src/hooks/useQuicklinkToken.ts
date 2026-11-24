import { useEffect, useState } from "react";

import { quicklinkToken } from "../lib/quicklink";

export function useQuicklinkToken(): string | undefined {
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    quicklinkToken()
      .then((value) => {
        if (!cancelled) {
          setToken(value);
        }
      })
      .catch(() => {
        // without a token the quicklink action simply stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return token;
}
