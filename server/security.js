export const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "X-Frame-Options": "DENY",
};
export function protectResponse(response, request) {
  const headers = new Headers(response.headers),
    url = new URL(request.url);
  for (const [key, value] of Object.entries(securityHeaders))
    headers.set(key, value);
  if (url.protocol === "https:")
    headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set(
    "Cache-Control",
    url.pathname.startsWith("/api/")
      ? "no-store"
      : /^\/assets\/.+-[\w-]{8,}\.(js|css|woff2?|png|svg)$/.test(url.pathname)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
export function logEvent(event, status, requestId) {
  // Fixed fields only: never log request URLs, queries, bodies, SQL, identity, cookies or errors.
  console.log(JSON.stringify({ event, status, request_id: requestId }));
}
