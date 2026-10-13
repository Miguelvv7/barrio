"use client";

/**
 * A minimal MCP Apps *host*: renders the server's MCP App inside an Echo Show-style frame, exactly as
 * Alexa+ does on screen devices — sandboxed iframe, the official AppBridge over postMessage, host
 * context (theme, device class, size), then the tool input and result.
 */
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { useEffect, useRef, useState } from "react";

export interface ScreenPayload {
  toolName: string;
  arguments: Record<string, unknown>;
  structuredContent: Record<string, unknown>;
  /** A tool error: no structuredContent, the server's JSON is in `errorText` (what MCP puts in content). */
  isError?: boolean;
  errorText?: string;
}

function toolResult(p: ScreenPayload) {
  return p.isError
    ? { isError: true, content: [{ type: "text" as const, text: p.errorText ?? "{}" }] }
    : { content: [{ type: "text" as const, text: JSON.stringify(p.structuredContent) }], structuredContent: p.structuredContent };
}

type Device = "echo-show-8" | "echo-show-15";
const DEVICES: Record<Device, { label: string; ratio: number }> = {
  "echo-show-8": { label: "Echo Show 8", ratio: 1280 / 800 },
  "echo-show-15": { label: "Echo Show 15", ratio: 1920 / 1080 },
};

export function EchoShow({
  html,
  payload,
  onUserMessage,
}: {
  html: string;
  payload: ScreenPayload;
  onUserMessage: (text: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<AppBridge | null>(null);
  const readyRef = useRef(false);
  const payloadRef = useRef(payload);
  const onMessageRef = useRef(onUserMessage);
  const [device, setDevice] = useState<Device>("echo-show-8");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const themeRef = useRef(theme);

  useEffect(() => {
    onMessageRef.current = onUserMessage;
  }, [onUserMessage]);

  const hostContext = (t: "light" | "dark") => {
    const width = screenRef.current?.clientWidth ?? 768;
    const height = screenRef.current?.clientHeight ?? 480;
    return {
      theme: t,
      displayMode: "inline" as const,
      availableDisplayModes: ["inline" as const],
      platform: "desktop" as const,
      deviceCapabilities: { touch: true, hover: false },
      containerDimensions: { width, height },
      locale: "en-US",
      deviceClass: device,
      maxWidth: width,
      maxHeight: height,
      isMobile: false,
    };
  };

  // (Re)create the sandboxed view whenever the HTML changes.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    readyRef.current = false;
    const bridge = new AppBridge(
      null,
      { name: "Barrio Alexa+ simulator", version: "1.0.0" },
      { message: { text: {} }, logging: {} },
      { hostContext: hostContext(themeRef.current) },
    );
    bridge.onmessage = async (params) => {
      const text = params.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .join(" ")
        .trim();
      if (text) onMessageRef.current(text);
      return {};
    };
    bridge.oninitialized = () => {
      readyRef.current = true;
      void bridge.sendToolInput({ arguments: payloadRef.current.arguments });
      void bridge.sendToolResult(toolResult(payloadRef.current));
    };
    bridgeRef.current = bridge;
    // Listen first, then load the view — so its ui/initialize can't arrive before we're ready.
    const win = iframe.contentWindow;
    let cancelled = false;
    if (win) {
      void bridge.connect(new PostMessageTransport(win, win)).then(() => {
        if (!cancelled) iframe.srcdoc = html;
      });
    }
    return () => {
      cancelled = true;
      void bridge.close().catch(() => {});
      bridgeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  // New tool result → same view, new data.
  useEffect(() => {
    payloadRef.current = payload;
    const bridge = bridgeRef.current;
    if (!bridge || !readyRef.current) return;
    void bridge.sendToolInput({ arguments: payload.arguments });
    void bridge.sendToolResult(toolResult(payload));
  }, [payload]);

  // The frame resizes with the page: tell the view its new dimensions, as a real host would.
  useEffect(() => {
    const el = screenRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const bridge = bridgeRef.current;
      if (bridge && readyRef.current) void bridge.sendHostContextChange(hostContext(themeRef.current));
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme / device changes → host-context-changed.
  useEffect(() => {
    themeRef.current = theme;
    const bridge = bridgeRef.current;
    if (bridge && readyRef.current) void bridge.sendHostContextChange(hostContext(theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, device]);

  const { ratio } = DEVICES[device];
  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <figcaption className="font-semibold uppercase tracking-[0.14em] text-ink-soft">On screen · MCP App</figcaption>
        <div className="flex gap-1.5">
          {(Object.keys(DEVICES) as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              className={`rounded-full px-2.5 py-1 font-semibold ${device === d ? "bg-ink text-cal" : "text-ink-soft"}`}
            >
              {DEVICES[d].label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="rounded-full px-2.5 py-1 font-semibold text-ink-soft"
          >
            {theme === "dark" ? "☾ Dark" : "☀ Light"}
          </button>
        </div>
      </div>
      <div className="rounded-[22px] bg-[#111] p-3 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)]">
        <div
          ref={screenRef}
          className="overflow-hidden rounded-[10px]"
          style={{ aspectRatio: String(ratio), background: theme === "dark" ? "#0e1116" : "#faf9fb" }}
        >
          <iframe
            ref={iframeRef}
            title="Alexa+ screen"
            sandbox="allow-scripts"
            className="block h-full w-full border-0"
          />
        </div>
      </div>
    </figure>
  );
}
