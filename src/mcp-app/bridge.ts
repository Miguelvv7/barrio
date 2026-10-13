/**
 * Minimal MCP Apps view-side bridge (spec 2026-01-26): JSON-RPC 2.0 over window.postMessage to the
 * host, exactly like the official PostMessageTransport, without bundling the whole SDK (~500 KB →
 * a few KB, as Alexa+ asks for light payloads). Compatibility is verified in the e2e suite against
 * the official AppBridge host.
 */
type Json = Record<string, unknown>;
type Handler = (params: Json) => void;

export const PROTOCOL_VERSION = "2026-01-26";

export class ViewBridge {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>();
  private handlers = new Map<string, Handler>();
  hostContext: Json = {};

  constructor(private appInfo: { name: string; version: string }) {
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent) return; // only our host
      const msg = event.data as Json;
      if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") return;
      if ("id" in msg && ("result" in msg || "error" in msg)) {
        const p = this.pending.get(msg.id as number);
        if (!p) return;
        this.pending.delete(msg.id as number);
        if (msg.error) p.reject(new Error(String((msg.error as Json).message ?? "error")));
        else p.resolve((msg.result as Json) ?? {});
        return;
      }
      if (typeof msg.method !== "string") return;
      if ("id" in msg) {
        // Host → view requests: teardown and ping just need an empty result; anything else is unknown.
        if (msg.method === "ui/resource-teardown" || msg.method === "ping") this.post({ jsonrpc: "2.0", id: msg.id, result: {} });
        else this.post({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } });
        return;
      }
      this.handlers.get(msg.method)?.((msg.params as Json) ?? {});
    });
  }

  on(method: string, handler: Handler) {
    this.handlers.set(method, handler);
  }

  private post(message: Json) {
    window.parent.postMessage(message, "*");
  }

  request(method: string, params: Json, timeoutMs = 10_000): Promise<Json> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.post({ jsonrpc: "2.0", id, method, params });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, timeoutMs);
    });
  }

  notify(method: string, params: Json = {}) {
    this.post({ jsonrpc: "2.0", method, params });
  }

  async connect() {
    // Retry the handshake a few times in case the host attached its listener after we loaded.
    let result: Json | null = null;
    for (let attempt = 0; attempt < 6 && !result; attempt++) {
      result = await this.request(
        "ui/initialize",
        { appInfo: this.appInfo, appCapabilities: { availableDisplayModes: ["inline"] }, protocolVersion: PROTOCOL_VERSION },
        attempt < 5 ? 800 : 10_000,
      ).catch(() => null);
    }
    if (!result) throw new Error("Host did not answer ui/initialize");
    this.hostContext = (result.hostContext as Json) ?? {};
    this.notify("ui/notifications/initialized", {});
    // Report our size so the host can fit the iframe (inline mode).
    const report = () =>
      this.notify("ui/notifications/size-changed", {
        width: Math.ceil(document.documentElement.scrollWidth),
        height: Math.ceil(document.documentElement.scrollHeight),
      });
    new ResizeObserver(report).observe(document.body);
    report();
  }

  sendMessage(text: string) {
    return this.request("ui/message", { role: "user", content: [{ type: "text", text }] });
  }
}
