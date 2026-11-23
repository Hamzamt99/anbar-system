import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { masterPath, subscribeMasterChanges } from "../master-events";
const empty = { data: [], has_more: false, next_cursor: null };
const keyFor = (source, query) => JSON.stringify([source, query]);
const asciiFold = (value) =>
  value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

export function useMasterOptions(source, query, open) {
  // A mounted, authenticated picker owns its records. Nothing persists or is shared between accounts.
  const cache = useRef(new Map()),
    flight = useRef(null),
    serial = useRef(0),
    alive = useRef(true);
  const [activity, setActivity] = useState({
    key: null,
    pending: false,
    error: "",
    pages: null,
  });
  const [revision, setRevision] = useState(0);
  const search = open ? query : "",
    key = keyFor(source, search),
    initialKey = keyFor(source, "");
  const initial = cache.current.get(initialKey);
  const snapshot =
    cache.current.get(key) ||
    (initial && !initial.has_more
      ? {
          ...empty,
          data: initial.data.filter((row) =>
            asciiFold(row.name).includes(asciiFold(search)),
          ),
        }
      : null);
  const request = useCallback(
    (text, cursor = null, previous = []) => {
      if (!source) return Promise.resolve();
      const requestKey = keyFor(source, text);
      if (
        flight.current?.key === requestKey &&
        flight.current.cursor === cursor
      )
        return flight.current.promise;
      flight.current?.controller.abort();
      const controller = new AbortController(),
        id = ++serial.current;
      setActivity({
        key: requestKey,
        pending: true,
        error: "",
        pages: cursor
          ? { data: previous, has_more: true, next_cursor: cursor }
          : null,
      });
      const promise = api(
        source +
          (source.includes("?") ? "&" : "?") +
          new URLSearchParams({
            search: text,
            limit: 50,
            ...(cursor ? { cursor } : {}),
          }),
        { signal: controller.signal },
      )
        .then((result) => {
          if (
            !alive.current ||
            controller.signal.aborted ||
            id !== serial.current
          )
            return;
          if (!cursor) {
            if (text === "") cache.current.clear(); // A fresh complete/first page invalidates older searches.
            cache.current.set(requestKey, result);
            // At most one empty-page entry and eight searched pages, each <=50 records.
            while (cache.current.size > 9) {
              const oldest = [...cache.current.keys()].find(
                (k) => k !== keyFor(source, ""),
              );
              cache.current.delete(oldest);
            }
          }
          setActivity({
            key: requestKey,
            pending: false,
            error: "",
            pages: cursor
              ? {
                  data: [...previous, ...result.data],
                  has_more: result.has_more,
                  next_cursor: result.next_cursor,
                }
              : null,
          });
        })
        .catch((error) => {
          if (
            alive.current &&
            !controller.signal.aborted &&
            id === serial.current
          )
            setActivity({
              key: requestKey,
              pending: false,
              error: error.message,
              pages: null,
            });
        })
        .finally(() => {
          if (flight.current?.id === id) flight.current = null;
        });
      flight.current = { key: requestKey, cursor, controller, id, promise };
      return promise;
    },
    [source],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      serial.current++;
      flight.current?.controller.abort();
      flight.current = null;
      cache.current.clear();
    };
  }, [source]);
  useEffect(() => {
    if (!source) return;
    const unsubscribe = subscribeMasterChanges((event) => {
      if (event.detail !== masterPath(source)) return;
      cache.current.clear();
      serial.current++;
      flight.current?.controller.abort();
      flight.current = null;
      setActivity({ key: null, pending: false, error: "", pages: null });
      setRevision((value) => value + 1);
    });
    return unsubscribe;
  }, [source]);
  useEffect(() => {
    if (!source) return;
    // Warm the first bounded page on mount. Opening is immediate; debounce typing only.
    if (!open && cache.current.has(keyFor(source, ""))) return;
    if (search === "") {
      void request("");
      return;
    }
    const timer = setTimeout(() => void request(search), 180);
    return () => clearTimeout(timer);
  }, [source, open, search, request, revision]);
  useEffect(() => {
    if (!source) return;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void request(open ? query : "");
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [source, open, query, request]);
  const result =
    activity.key === key && activity.pages ? activity.pages : snapshot || empty;
  return {
    data: result.data,
    next: result.has_more ? result.next_cursor : null,
    loading:
      Boolean(source) &&
      (activity.key === key ? activity.pending : open || !snapshot),
    ready:
      !source || Boolean(snapshot || (activity.key === key && activity.pages)),
    error: activity.key === key ? activity.error : "",
    loadMore: () => request(search, result.next_cursor, result.data),
  };
}
