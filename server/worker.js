import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";
import { createApp } from "./app.js";
import { protectResponse } from "./security.js";
createApp(env.DB, { production: env.APP_ENV === "production" }).listen(3000);
const api = httpServerHandler({ port: 3000 });
export default {
  async fetch(request, bindings, ctx) {
    const url = new URL(request.url);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      url.protocol = "https:";
      return protectResponse(Response.redirect(url, 308), request);
    }
    const response = url.pathname.startsWith("/api/")
      ? await api.fetch(request, bindings, ctx)
      : await bindings.ASSETS.fetch(request);
    return protectResponse(response, request);
  },
};
