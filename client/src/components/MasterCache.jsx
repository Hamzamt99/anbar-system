import React, { createContext, useContext, useEffect, useMemo } from "react";
import { api, masterTypes } from "../api";
import { subscribeMasterChanges } from "../master-events";
const Context = createContext(null);
const paths = new Set(masterTypes.map(([path]) => path));
const keyFor = (path, search, cursor) => JSON.stringify([path, search, cursor]);

function createCache() {
  const entries = new Map(),
    listeners = new Set();
  let revision = 0;
  const changed = () => {
    revision++;
    listeners.forEach((listener) => listener());
  };
  const invalidate = (path) => {
    for (const [key, entry] of entries) {
      if (!path || entry.path === path) {
        entry.controller.abort();
        entries.delete(key);
      }
    }
    changed();
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => revision,
    read: (path, search = "", cursor = null) =>
      entries.get(keyFor(path, search, cursor)),
    invalidate,
    fetch(path, search = "", cursor = null) {
      if (!paths.has(path)) throw new Error("Unknown master path");
      const key = keyFor(path, search, cursor),
        existing = entries.get(key);
      if (existing) return existing.promise;
      const controller = new AbortController();
      const entry = {
        path,
        search,
        cursor,
        controller,
        status: "loading",
        data: [],
        error: "",
      };
      entries.set(key, entry);
      // Keep each initial tab page plus eight searched/cursor pages. No unbounded catalog cache.
      const extra = [...entries].filter(
        ([, value]) => value.path === path && (value.search || value.cursor),
      );
      while (extra.length > 8) {
        const [oldKey, old] = extra.shift();
        old.controller.abort();
        entries.delete(oldKey);
      }
      entry.promise = api(
        "/" +
          path +
          "?" +
          new URLSearchParams({
            search,
            limit: 50,
            ...(cursor ? { cursor } : {}),
          }),
        { signal: controller.signal },
      )
        .then((result) => {
          if (entries.get(key) !== entry || controller.signal.aborted) return;
          Object.assign(entry, result, { status: "ready" });
          changed();
          return result;
        })
        .catch((error) => {
          if (entries.get(key) !== entry || controller.signal.aborted) return;
          entry.status = "error";
          entry.error = error.message;
          changed();
        });
      changed();
      return entry.promise;
    },
  };
}
export function MasterCacheProvider({ identity, children }) {
  const cache = useMemo(createCache, [identity]);
  useEffect(() => {
    const unsubscribe = subscribeMasterChanges((event) =>
      cache.invalidate(event.detail.slice(1)),
    );
    return () => {
      unsubscribe();
      cache.invalidate();
    };
  }, [cache]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useMasterCache() {
  return useContext(Context);
}
