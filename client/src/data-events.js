const name = "anbar:data-changed";
const allowed = new Set(["invoices", "users", "audit-logs", "session"]);
let channel;
function emit(resource) {
  if (allowed.has(resource))
    window.dispatchEvent(new CustomEvent(name, { detail: resource }));
}
function connect() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(name);
      channel.addEventListener("message", (event) => {
        // Authentication changed in another tab: discard private UI state and re-check the current cookie.
        if (event.data === "session") window.location.reload();
        else emit(event.data);
      });
    } catch {
      return;
    }
  }
  return channel;
}
export function notifyDataChange(path) {
  const resource = ["/auth/login", "/auth/logout"].includes(path)
    ? "session"
    : path.split("/")[1];
  if (!allowed.has(resource)) return;
  const targets =
    resource === "invoices" ? ["invoices", "audit-logs"] : [resource];
  for (const target of targets) {
    emit(target);
    try {
      connect()?.postMessage(target);
    } catch {
      /* A successful save must remain successful. */
    }
  }
}
export function subscribeDataChanges(listener) {
  connect();
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
