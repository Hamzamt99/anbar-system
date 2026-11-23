// Metadata-only invalidation; never broadcast names, records, credentials or responses.
const eventName = "anbar:master-data-changed";
const paths = new Set([
  "/customers",
  "/drivers",
  "/mix-types",
  "/vehicles",
  "/pumps",
  "/mixers",
]);
let channel;
export function masterPath(source) {
  return new URL(source, window.location.origin).pathname
    .split("/")
    .slice(0, 2)
    .join("/");
}
function emit(path) {
  if (paths.has(path))
    window.dispatchEvent(new CustomEvent(eventName, { detail: path }));
}
function connect() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel("anbar-master-invalidation");
    } catch {
      return undefined;
    }
    channel.addEventListener("message", (event) => {
      if (typeof event.data === "string") emit(event.data);
    });
  }
  return channel;
}
export function notifyMasterChange(path) {
  if (typeof window === "undefined") return;
  const key = masterPath(path);
  if (!paths.has(key)) return;
  emit(key);
  try {
    connect()?.postMessage(key);
  } catch {
    /* Invalidation must not turn a successful write into an error. */
  }
}
export function subscribeMasterChanges(listener) {
  connect();
  window.addEventListener(eventName, listener);
  return () => window.removeEventListener(eventName, listener);
}
