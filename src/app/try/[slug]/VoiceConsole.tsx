"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Wordmark } from "@/components/Wordmark";
import { EchoShow, type ScreenPayload } from "./EchoShow";

type Kind = "salon" | "restaurant";
type Lang = "en" | "es";
type Phase = "idle" | "listening" | "thinking" | "speaking";

interface Trace {
  name: string;
  arguments: Record<string, unknown>;
  isError: boolean;
  result: string;
  structuredContent?: Record<string, unknown>;
  uiResourceUri?: string;
}
interface Turn {
  role: "user" | "assistant";
  content: string;
  trace?: Trace[];
}

// Minimal typing for the Web Speech API (not in TS's DOM lib everywhere).
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

const SUGGESTIONS: Record<Kind, Record<Lang, string[]>> = {
  salon: {
    en: [
      "How much is a haircut and beard trim?",
      "Do you have anything tomorrow after five?",
      "Book a beard trim on Friday at 11 for Miguel, phone 600 123 456.",
    ],
    es: [
      "¿Cuánto cuesta corte y barba?",
      "¿Tienes hueco mañana por la tarde?",
      "Resérvame arreglo de barba el viernes a las 11, soy Miguel, 600 123 456.",
    ],
  },
  restaurant: {
    en: [
      "What burgers do you have?",
      "Is the guacamole gluten-free?",
      "A table for four on Friday at nine, please. I'm Lucía, 600 111 222.",
    ],
    es: [
      "¿Qué hamburguesas tenéis?",
      "¿El guacamole es sin gluten?",
      "Mesa para cuatro el viernes a las nueve, soy Lucía, 600 111 222.",
    ],
  },
};

const PHASE_LABEL: Record<Lang, Record<Phase, string>> = {
  en: { idle: "Tap to talk", listening: "Listening…", thinking: "Thinking…", speaking: "Speaking…" },
  es: { idle: "Toca para hablar", listening: "Te escucho…", thinking: "Pensando…", speaking: "Hablando…" },
};

const noopSubscribe = () => () => {};

/** Most recent turns that fit the server's limits (30 turns, ~10k chars), starting with a user turn. */
function recentHistory(history: Turn[]) {
  const out: { role: Turn["role"]; content: string }[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && out.length < 30; i--) {
    const content = history[i].content.slice(0, 1000);
    if (chars + content.length > 10_000) break;
    chars += content.length;
    out.unshift({ role: history[i].role, content });
  }
  while (out.length > 1 && out[0].role !== "user") out.shift();
  return out;
}

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceConsole({
  business,
  others,
  configured,
  demoNotice,
  token,
}: {
  business: { slug: string; name: string; kind: Kind; description: string };
  others: { slug: string; name: string }[];
  configured: boolean;
  demoNotice: boolean;
  token: string;
}) {
  const [lang, setLang] = useState<Lang>("en");
  const [phase, setPhase] = useState<Phase>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<{ uri: string; html: string } | null>(null);
  const [screen, setScreen] = useState<ScreenPayload | null>(null);
  const uiRef = useRef<{ uri: string; html: string } | null>(null);
  const speechSupported = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(getRecognitionCtor()),
    () => false,
  );
  const recognitionRef = useRef<Recognition | null>(null);
  const turnsRef = useRef<Turn[]>([]);
  const busyRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    turnsRef.current = turns;
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, interim]);
  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (muted || typeof window === "undefined" || !window.speechSynthesis) {
        setPhase("idle");
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "es" ? "es-ES" : "en-US";
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith(u.lang.slice(0, 2)));
      if (voice) u.voice = voice;
      u.rate = 1.03;
      u.onend = () => setPhase("idle");
      u.onerror = () => setPhase("idle");
      setPhase("speaking");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [lang, muted],
  );

  const send = useCallback(
    async (text: string) => {
      const content = text.trim().slice(0, 1000);
      if (!content || busyRef.current) return;
      busyRef.current = true;
      setError(null);
      setDraft("");
      setInterim("");
      const history: Turn[] = [...turnsRef.current, { role: "user", content }];
      setTurns(history);
      setPhase("thinking");
      try {
        const res = await fetch(`/api/assistant/${business.slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Barrio-Token": token },
          body: JSON.stringify({ lang, messages: recentHistory(history), knownUiUris: uiRef.current ? [uiRef.current.uri] : [] }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message ?? "Something went wrong.");
        setTurns([...history, { role: "assistant", content: data.reply, trace: data.trace }]);
        if (data.ui?.html) {
          uiRef.current = data.ui;
          setUi(data.ui);
        }
        const trace = (data.trace as Trace[]) ?? [];
        const shown = [...trace].reverse().find((t) => t.structuredContent && t.uiResourceUri);
        const last = trace.at(-1);
        if (last?.isError && uiRef.current) {
          // Like Alexa+: the screen shows the last answer, including "which one?" and "not free" errors.
          setScreen({ toolName: last.name, arguments: last.arguments, structuredContent: {}, isError: true, errorText: last.result });
        } else if (shown?.structuredContent) {
          setScreen({ toolName: shown.name, arguments: shown.arguments, structuredContent: shown.structuredContent });
        }
        speak(data.reply);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setTurns(history);
        setPhase("idle");
      } finally {
        busyRef.current = false;
      }
    },
    [business.slug, lang, speak, token],
  );

  const listen = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    if (phase === "listening") {
      recognitionRef.current?.stop();
      return;
    }
    if (phase === "speaking") window.speechSynthesis?.cancel();
    if (phase === "thinking") return;
    const rec = new Ctor();
    rec.lang = lang === "es" ? "es-ES" : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else live += r[0].transcript;
      }
      setInterim(finalText + live);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError(lang === "es" ? "Permite el micrófono para hablar, o escribe abajo." : "Allow microphone access to talk, or type below.");
      }
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setInterim("");
      if (finalText.trim()) void send(finalText);
      else setPhase("idle");
    };
    recognitionRef.current = rec;
    setPhase("listening");
    try {
      rec.start();
    } catch {
      setPhase("idle");
    }
  }, [lang, phase, send]);

  const reset = () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
    setTurns([]);
    setError(null);
    setScreen(null);
    setPhase("idle");
  };

  const ringActive = phase !== "idle";

  return (
    <main className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-2 text-sm">
          <div className="flex rounded-full border-[1.5px] border-line p-0.5" role="group" aria-label="Language">
            {(["en", "es"] as Lang[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={`rounded-full px-3 py-1 font-semibold uppercase ${lang === l ? "bg-ink text-cal" : "text-ink-soft"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-ghost !py-1.5" onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
            {muted ? "🔇 Muted" : "🔊 Voice on"}
          </button>
          <Link href={`/dashboard/${business.slug}`} className="btn btn-ghost !py-1.5">
            Owner view
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[380px_1fr]">
        <section className="flex flex-col items-center text-center lg:sticky lg:top-6 lg:h-fit">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-olivo">Alexa+ simulator · via MCP</p>
          <h1 className="mt-2 font-display text-4xl font-medium leading-tight tracking-tight">{business.name}</h1>
          <p className="mt-2 max-w-xs text-sm text-ink-soft">{business.description}</p>
          {demoNotice && (
            <p className="mt-3 max-w-xs rounded-md border-[1.5px] border-albero/60 bg-albero/10 px-3 py-1.5 text-xs">
              {lang === "es"
                ? "Demo: las reservas hechas aquí no llegan al negocio real."
                : "Demo: bookings made here are not sent to the real business."}
            </p>
          )}

          <button
            type="button"
            onClick={speechSupported ? listen : undefined}
            disabled={!configured || !speechSupported}
            aria-label={PHASE_LABEL[lang][phase]}
            className="group relative mt-10 grid size-56 place-items-center rounded-full disabled:cursor-not-allowed"
          >
            <span
              aria-hidden
              className={`absolute inset-0 rounded-full border-[10px] transition-colors duration-500 ${
                phase === "listening"
                  ? "animate-pulse border-azulejo"
                  : phase === "thinking"
                    ? "border-albero"
                    : phase === "speaking"
                      ? "border-terracota"
                      : "border-ink/15 group-hover:border-azulejo/50"
              }`}
              style={phase === "thinking" ? { borderTopColor: "transparent", animation: "spin 0.9s linear infinite" } : undefined}
            />
            <span aria-hidden className={`absolute inset-6 rounded-full bg-ink transition-transform duration-500 ${ringActive ? "scale-95" : "scale-100"}`} />
            <span aria-hidden className="azulejo absolute inset-[38%] rounded-full opacity-90 [--tile:22px]" />
          </button>
          <p className="mt-5 font-display text-xl" aria-live="polite">
            {!configured ? "Voice simulator not configured" : speechSupported ? PHASE_LABEL[lang][phase] : lang === "es" ? "Escribe abajo" : "Type below"}
          </p>
          {!speechSupported && configured && (
            <p className="mt-1 text-xs text-ink-soft">This browser has no speech recognition — Chrome, Edge or Safari do.</p>
          )}

          {others.length > 0 && (
            <div className="mt-10 text-sm">
              <p className="text-ink-soft">Try another business:</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {others.map((o) => (
                  <Link key={o.slug} href={`/try/${o.slug}`} className="btn btn-ghost !py-1">
                    {o.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="grid content-start gap-6">
        {ui && screen ? (
          <EchoShow html={ui.html} payload={screen} onUserMessage={(text) => void send(text)} />
        ) : (
          <figure className="m-0">
            <figcaption className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">On screen · MCP App</figcaption>
            <div className="rounded-[22px] bg-[#111] p-3">
              <div className="grid aspect-[16/10] place-items-center rounded-[10px] bg-[#0e1116] text-center">
                <div>
                  <span aria-hidden className="azulejo mx-auto block size-10 rounded-md [--tile:20px]" />
                  <p className="mt-3 text-sm text-[#a7afbb]">
                    {lang === "es" ? "Las tarjetas de Alexa+ aparecerán aquí" : "Alexa+ cards will appear here"}
                  </p>
                </div>
              </div>
            </div>
          </figure>
        )}
        <section className="rotulo flex min-h-[420px] flex-col">
          <div className="flex items-center justify-between border-b-[1.5px] border-line px-5 py-3">
            <p className="text-sm font-semibold">Conversation</p>
            {turns.length > 0 && (
              <button type="button" onClick={reset} className="text-sm text-ink-soft hover:text-ink">
                Start over
              </button>
            )}
          </div>

          <div ref={logRef} className="flex max-h-[62vh] flex-1 flex-col gap-4 overflow-y-auto p-5" aria-live="polite">
            {!configured && (
              <p className="rounded-md border-[1.5px] border-albero/60 bg-albero/10 p-4 text-sm">
                Set <code className="font-mono">ANTHROPIC_API_KEY</code> on the server to enable the simulated assistant. The MCP server
                itself works without it.
              </p>
            )}
            {configured && turns.length === 0 && (
              <div className="m-auto max-w-md text-center">
                <p className="font-display text-2xl">{lang === "es" ? "Pregunta lo que quieras" : "Ask anything a customer would"}</p>
                <div className="mt-5 flex flex-col gap-2">
                  {SUGGESTIONS[business.kind][lang].map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="rounded-md border-[1.5px] border-line px-4 py-2.5 text-left text-sm hover:border-ink">
                      “{s}”
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex flex-col ${t.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                    t.role === "user" ? "rounded-br-sm bg-ink text-cal" : "rounded-bl-sm border-[1.5px] border-line bg-cal"
                  }`}
                >
                  {t.content}
                </div>
                {t.trace && t.trace.length > 0 && (
                  <details className="mt-1.5 max-w-[85%] text-xs">
                    <summary className="cursor-pointer select-none font-mono text-azulejo">
                      {t.trace.length} MCP call{t.trace.length > 1 ? "s" : ""}: {t.trace.map((c) => c.name).join(" → ")}
                    </summary>
                    <ol className="mt-2 grid gap-2">
                      {t.trace.map((c, j) => (
                        <li key={j} className={`rounded-md border p-2 font-mono ${c.isError ? "border-danger/40" : "border-line"}`}>
                          <p className="font-semibold">
                            {c.name}({Object.entries(c.arguments).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})
                          </p>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-ink-soft">{c.result}</pre>
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            ))}
            {interim && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink/60 px-4 py-2.5 text-cal">{interim}</div>
              </div>
            )}
            {phase === "thinking" && (
              <div className="flex gap-1 px-2" aria-label="Thinking">
                {[0, 1, 2].map((d) => (
                  <span key={d} className="size-2 animate-bounce rounded-full bg-albero" style={{ animationDelay: `${d * 120}ms` }} />
                ))}
              </div>
            )}
          </div>

          {error && <p role="alert" className="mx-5 mb-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

          <form
            className="flex gap-2 border-t-[1.5px] border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              disabled={!configured}
              placeholder={lang === "es" ? "O escribe aquí…" : "Or type here…"}
              className="field flex-1"
              aria-label="Message"
            />
            <button className="btn btn-primary" disabled={!configured || !draft.trim() || phase === "thinking"}>
              {lang === "es" ? "Enviar" : "Send"}
            </button>
          </form>
        </section>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </main>
  );
}
