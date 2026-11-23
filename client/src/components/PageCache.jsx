import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { api } from "../api";
import { subscribeMasterChanges } from "../master-events";
import { subscribeDataChanges } from "../data-events";
const Context = createContext(null);
const resourceFor = (path) => path.split("?")[0].slice(1);
function keyFor(path) {
  const [base, query] = path.split("?");
  const params = new URLSearchParams(query);
  if (["/invoices", "/users", "/audit-logs"].includes(base)) {
    if (!params.has("page")) params.set("page", "1");
    if (base !== "/users" && !params.has("count")) params.set("count", "1");
  } else {
    if (!params.has("limit")) params.set("limit", "50");
    if (!params.has("search")) params.set("search", "");
  }
  params.sort();
  return base + "?" + params;
}
function createCache() {
  const entries = new Map(),
    listeners = new Set();
  let revision = 0;
  const changed = () => {
    revision++;
    listeners.forEach((listener) => listener());
  };
  const invalidate = (resource) => {
    for (const [key, entry] of entries) {
      if (!resource || resourceFor(key) === resource) {
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
    read: (path) => entries.get(keyFor(path)),
    invalidate,
    fetch(path) {
      const key = keyFor(path),
        old = entries.get(key);
      if (old) return old.promise;
      const controller = new AbortController();
      const entry = { controller, status: "loading", error: "", result: null };
      entries.set(key, entry);
      // Pin each unfiltered first page; retain at most eight additional pages/filter results per resource.
      const resource = resourceFor(key);
      const pinned = keyFor(
        "/" +
          resource +
          (["customers", "drivers"].includes(resource)
            ? "?include_deleted=1"
            : ""),
      );
      const extra = [...entries].filter(
        ([other]) =>
          resourceFor(other) === resourceFor(key) && other !== pinned,
      );
      while (extra.length > 8) {
        const [other, value] = extra.shift();
        value.controller.abort();
        entries.delete(other);
      }
      entry.promise = api(key, { signal: controller.signal })
        .then((result) => {
          if (entries.get(key) !== entry || controller.signal.aborted) return;
          entry.result = result;
          entry.status = "ready";
          changed();
          return result;
        })
        .catch((error) => {
          if (entries.get(key) !== entry || controller.signal.aborted) return;
          entry.error = error.message;
          entry.status = "error";
          changed();
        });
      changed();
      return entry.promise;
    },
  };
}
export function PageCacheProvider({ identity, role, children }) {
  const cache = useMemo(createCache, [identity]);
  useEffect(() => {
    const unsubscribe = subscribeDataChanges((event) =>
      cache.invalidate(event.detail === "session" ? undefined : event.detail),
    );
    const unsubscribeMasters = subscribeMasterChanges((event) =>
      cache.invalidate(event.detail.slice(1)),
    );
    void cache.fetch("/invoices");
    if (role !== "DATA_ENTRY") {
      void cache.fetch("/customers?include_deleted=1");
      void cache.fetch("/drivers?include_deleted=1");
    }
    if (role === "SUPER_ADMIN") {
      void cache.fetch("/users");
      void cache.fetch("/audit-logs");
    }
    return () => {
      unsubscribe();
      unsubscribeMasters();
      cache.invalidate();
    };
  }, [cache, role]);
  return <Context.Provider value={cache}>{children}</Context.Provider>;
}
export function useCachedPage(path, onChange) {
  const reset = useRef(onChange);
  reset.current = onChange;
  const resource = resourceFor(path);
  useEffect(
    () =>
      subscribeDataChanges((event) => {
        if (event.detail === resource) reset.current?.();
      }),
    [resource],
  );
  const cache = useContext(Context);
  const revision = useSyncExternalStore(cache.subscribe, cache.snapshot);
  const entry = cache.read(path);
  const [base, query] = keyFor(path).split("?");
  const params = new URLSearchParams(query);
  params.set("page", "1");
  params.delete("cursor");
  if (base !== "/users") params.set("count", "1");
  const firstPath = base + "?" + params;
  const first = base === "/users" ? entry : cache.read(firstPath);
  useEffect(() => {
    if (!cache.read(path)) void cache.fetch(path);
    // Invalidation also discards counts. Refresh the matching first page when visiting a later page.
    if (base !== "/users" && !cache.read(firstPath))
      void cache.fetch(firstPath);
  }, [cache, path, firstPath, base, revision]);
  return {
    result: entry?.result,
    total: first?.result?.total,
    loading: !entry || entry.status === "loading",
    error: entry?.error || first?.error || "",
    load: () => cache.fetch(path),
    retry: () => {
      cache.invalidate(resourceFor(path));
      void cache.fetch(path);
    },
  };
}

export function usePageCache() {
  return useContext(Context);
}
