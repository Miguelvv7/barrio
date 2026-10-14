/**
 * Barrio's MCP App — the card Alexa+ shows on screen devices (Echo Show) next to the spoken answer.
 *
 * Follows the Alexa+ MCP add-on design guide:
 *  - authored on a 768×480 base canvas and scaled with one root `zoom` (Echo Show 8/15 ≈ 1.667);
 *  - light and dark themes from the host context; Amazon's card tokens (#FFFFFF/#FAF9FB, #14181E/#1B2028);
 *  - brand colour reserved for small accents and the completion state, logo top-left;
 *  - 3–5 items per row, strongest first, text readable from arm's length;
 *  - never relies on window.parent, cookies or storage; talks to the host only via the MCP Apps bridge.
 * All data is rendered with textContent — nothing from the server is ever parsed as HTML.
 * Labels follow the host's `locale` (English, or Spanish for "es-*"). Names are shown as the business
 * wrote them; descriptions in English when the business wrote an English version.
 */
import { ViewBridge } from "./bridge";

type Data = Record<string, unknown> & { view?: string };
type Ctx = Record<string, unknown> & { theme?: string; displayMode?: string; platform?: string };

const BASE_W = 768;
const BASE_H = 480;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string; title?: string; onClick?: () => void; aria?: string } = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.aria) el.setAttribute("aria-label", props.aria);
  if (props.onClick) {
    el.addEventListener("click", props.onClick);
    if (tag !== "button") el.setAttribute("role", "button");
  }
  for (const c of children) if (c) el.append(typeof c === "string" ? document.createTextNode(c) : c);
  return el;
}

const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback);
const arr = <T = Data>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const obj = (v: unknown): Data => (v && typeof v === "object" ? (v as Data) : {});

type Lang = "en" | "es";
let lang: Lang = "en";
const es = () => lang === "es";

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};
const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/** The server names weekdays in English ("Friday"). */
function weekday(name: string) {
  const i = WEEKDAYS_EN.indexOf(name);
  return es() && i >= 0 ? WEEKDAYS_ES[i] : name;
}
function niceDate(date: string, day?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${day ? `${weekday(day)} ` : ""}${Number(m[3])} ${MONTHS[lang][Number(m[2]) - 1]}`;
}
/** The business's English text in English, when it wrote one; its own words otherwise. */
const described = (d: Data) => (es() ? str(d.description) : str(d.description_en) || str(d.description));
/** "from 12,00 €" → "desde 12,00 €". */
const price = (v: unknown) => (es() ? str(v).replace(/^from /, "desde ") : str(v));

/** Menu section names, both ways: only the heading is translated, never a dish. */
const CATEGORIES: [string, string][] = [
  ["Starters", "Entrantes"],
  ["Salads", "Ensaladas"],
  ["Burgers", "Hamburguesas"],
  ["Desserts", "Postres"],
  ["Drinks", "Bebidas"],
  ["Mains", "Principales"],
  ["Meat", "Carnes"],
  ["Fish", "Pescados"],
  ["Sandwiches", "Bocadillos"],
  ["Soups", "Sopas"],
  ["Rice dishes", "Arroces"],
  ["Wines", "Vinos"],
  ["Beers", "Cervezas"],
  ["Coffee", "Cafés"],
  ["Breakfast", "Desayunos"],
  ["Kids", "Infantil"],
];
function category(name: string) {
  const key = name.trim().toLowerCase();
  const pair = CATEGORIES.find(([en, sp]) => en.toLowerCase() === key || sp.toLowerCase() === key);
  return pair ? pair[es() ? 1 : 0] : name;
}

/** Spanish lines for the error codes a customer sees most; the server's text is for the assistant. */
const ERRORS_ES: [RegExp, string][] = [
  [/^slot_/, "Esa hora no está libre."],
  [/^too_many_bookings$/, "Este teléfono ya tiene varias reservas aquí."],
  [/^duplicate$/, "Ya tienes una reserva a esa hora."],
  [/^(party_too_large|invalid_party_size)$/, "Para ese grupo, llama al local."],
  [/^not_found$/, "No encuentro esa reserva."],
  [/^invalid_/, "Falta algún dato o no es válido."],
  [/^unavailable$/, "Algo ha fallado. Inténtalo de nuevo en un momento."],
];

const app = new ViewBridge({ name: "barrio-card", version: "1.0.0" });
let lastData: Data | null = null;
/** A tool error (isError): shown as its own view, with any options as tappable choices. */
let lastError: Data | null = null;
let lastInput: Data = {};
let businessName = "";
let cancelled = false;
let ctx: Ctx = {};
let busyUntil = 0;

/**
 * Sends what the customer tapped back to the assistant, as if they'd said it. The tapped control
 * is marked as sent and the others pause briefly, so a double tap can't book twice.
 */
function ask(text: string, el?: HTMLElement) {
  const now = Date.now();
  if (now < busyUntil) return;
  busyUntil = now + 2500;
  const card = document.querySelector(".card");
  card?.classList.add("busy");
  document.querySelectorAll(".sent").forEach((n) => {
    n.classList.remove("sent");
    n.removeAttribute("aria-pressed");
  });
  el?.classList.add("sent");
  el?.setAttribute("aria-pressed", "true");
  const done = () => {
    card?.classList.remove("busy");
    busyUntil = 0;
  };
  setTimeout(done, 2500);
  void app.sendMessage(text).catch(() => {
    el?.classList.remove("sent");
    done();
  });
}

const SVG = "http://www.w3.org/2000/svg";
function svg(tag: string, attrs: Record<string, string | number>) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Barrio's azulejo mark (the store-listing logo), drawn as SVG nodes — no HTML parsing. */
function mark() {
  const root = svg("svg", { viewBox: "0 0 20 20", width: 20, height: 20, class: "mark", role: "img", "aria-label": "Barrio" });
  const clip = svg("clipPath", { id: "m" });
  clip.append(svg("rect", { width: 20, height: 20, rx: 4 }));
  const g = svg("g", { "clip-path": "url(#m)" });
  g.append(
    svg("rect", { width: 20, height: 20, class: "m-bg" }),
    svg("line", { x1: 0, y1: 0, x2: 20, y2: 20, class: "m-line faint" }),
    svg("line", { x1: 20, y1: 0, x2: 0, y2: 20, class: "m-line faint" }),
    ...[[0, 0], [20, 0], [0, 20], [20, 20]].map(([cx, cy]) => svg("circle", { cx, cy, r: 7.2, class: "m-line" })),
    svg("circle", { cx: 10, cy: 10, r: 1.7, class: "m-dot" }),
  );
  root.append(clip, g);
  return root;
}

function header(data: Data, kicker: string) {
  return h(
    "header",
    { class: "hd" },
    mark(),
    h("span", { class: "biz", text: str(data.business ?? data.name, businessName || "Barrio") }),
    h("span", { class: "kicker", text: kicker }),
  );
}

function chip(label: string, say: string) {
  const el: HTMLButtonElement = h("button", { class: "chip", text: label });
  el.addEventListener("click", () => ask(say, el));
  return el;
}

function tapTarget(cls: string, say: string, ...children: (Node | null | false)[]) {
  const el = h("button", { class: cls }, ...children);
  el.addEventListener("click", () => ask(say, el));
  return el;
}

const table = (n: unknown) => (es() ? `Mesa para ${str(n)}` : `Table for ${str(n)}`);

function viewBooking(d: Data) {
  const b = obj(d.booking);
  const what = Number(b.party_size) > 1 || str(b.service) === "Table" ? table(b.party_size) : str(b.service);
  const ref = str(b.reference);
  return [
    header({ business: b.business }, es() ? "Reserva confirmada" : "Booking confirmed"),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        { class: "col" },
        h("div", { class: "done", aria: es() ? "Confirmada" : "Confirmed", text: "✓" }),
        h("p", { class: "d1", text: es() ? "Reservado" : "You're booked" }),
        h("p", { class: "d3", text: `${niceDate(str(b.date), str(b.weekday))} · ${str(b.time)}` }),
        h("p", { class: "b1", text: what }),
        h("p", { class: "b2 muted", text: str(b.address) }),
      ),
      h(
        "div",
        { class: "inner refbox" },
        h("p", { class: "lbl", text: es() ? "Referencia" : "Reference" }),
        h("p", { class: "ref", aria: `${es() ? "Referencia" : "Reference"} ${ref.split("").join(" ")}`, text: ref.split("").join(" ") }),
        h("p", { class: "b2 muted", text: es() ? `Para cambiarla, llama al ${str(b.phone)}` : `To change it, call ${str(b.phone)}` }),
      ),
    ),
  ];
}

function viewAvailability(d: Data) {
  const forWhat = str(d.service) === "Table" ? table(d.party_size) : str(d.service);
  const title = `${niceDate(str(d.date), str(d.weekday))} · ${forWhat}`;
  if (!d.available) {
    const next = arr(d.next_available).slice(0, 3);
    return [
      header(d, es() ? "Sin horas libres" : "No free times"),
      h("p", { class: "d3", text: title }),
      h("p", { class: "b1 muted", text: es() ? (next.length ? "Ese día no queda hueco. Estos días sí:" : "Ese día no queda hueco.") : str(d.message) }),
      next.length
        ? h(
            "div",
            { class: "row3" },
            ...next.map((n) =>
              tapTarget(
                "inner tile",
                es() ? `¿Y el ${niceDate(str(n.date), str(n.weekday))}?` : `What about ${niceDate(str(n.date), str(n.weekday))}?`,
                h("span", { class: "lbl", text: es() ? "Próximo libre" : "Next free" }),
                h("span", { class: "h1", text: niceDate(str(n.date), str(n.weekday)) }),
                h("span", { class: "b1", text: es() ? `desde las ${str(n.first_time)}` : `from ${str(n.first_time)}` }),
              ),
            ),
          )
        : null,
    ];
  }
  const times = arr<string>(d.start_times);
  // Say everything needed to book, so the tap works as a complete spoken request.
  const isTable = str(d.service) === "Table";
  const when = niceDate(str(d.date), str(d.weekday));
  const say = (t: string) =>
    es()
      ? `Reserva a las ${t} el ${when} ${isTable ? `para ${str(d.party_size)} personas` : `para ${forWhat}`}, por favor.`
      : `Book ${t} on ${when} ${isTable ? `for ${str(d.party_size)}` : `for ${forWhat}`}, please.`;
  const intro = [header(d, es() ? "Horas libres" : "Free times"), h("p", { class: "d3", text: title })];
  const count = (n: number) => (es() ? `${n} ${n === 1 ? "hora" : "horas"}` : `${n} start ${n === 1 ? "time" : "times"}`);
  if (times.length <= 12) {
    return [
      ...intro,
      h("p", { class: "b2 muted", text: `${es() ? "Toca una hora para reservar" : "Tap a time to book"} · ${count(times.length)}` }),
      h("div", { class: "chips" }, ...times.map((t) => chip(t, say(t)))),
    ];
  }
  // Many times: one swipeable row per part of the day, instead of hiding the afternoon.
  const parts: [string, string[]][] = [
    [es() ? "Mañana" : "Morning", times.filter((t) => t < "12:00")],
    [es() ? "Mediodía" : "Afternoon", times.filter((t) => t >= "12:00" && t < "17:00")],
    [es() ? "Tarde y noche" : "Evening", times.filter((t) => t >= "17:00")],
  ];
  return [
    ...intro,
    h("p", { class: "b2 muted", text: es() ? `Toca una hora para reservar · ${count(times.length)} · desliza para ver más` : `Tap a time to book · ${count(times.length)} · swipe for more` }),
    ...parts
      .filter(([, list]) => list.length)
      .map(([label, list]) =>
        h(
          "div",
          { class: "daypart" },
          h("span", { class: "lbl", text: label }),
          h("div", { class: "chiprow" }, ...list.map((t) => chip(t, say(t)))),
        ),
      ),
  ];
}

function emptyState(d: Data, kicker: string, what: string) {
  const q = str(lastInput.query);
  return [
    header(d, kicker),
    h("p", { class: "d3", text: es() ? (q ? `Nada coincide con “${q}”` : "Todavía no hay nada en la lista") : q ? `Nothing matches “${q}”` : `No ${what} listed yet` }),
    h("p", { class: "b1 muted", text: es() ? (q ? "Pide otra cosa, o la lista completa." : "Pregunta directamente al local.") : q ? `Ask for something else, or for the full list of ${what}.` : "Ask the business directly for details." }),
  ];
}

function viewServices(d: Data) {
  const all = arr(d.items);
  const label = es() ? "Servicios" : "Services";
  if (all.length === 0) return emptyState(d, label, "services");
  const items = all.slice(0, 5);
  return [
    header(d, all.length > items.length ? `${label} · ${all.length}` : label),
    h(
      "div",
      { class: "list" },
      ...items.map((s) =>
        tapTarget(
          "inner item",
          es() ? `Quiero reservar ${str(s.name)}.` : `I'd like to book ${str(s.name)}.`,
          h("span", { class: "grow" }, h("span", { class: "h1", text: str(s.name) }), h("span", { class: "b2 muted", text: `${str(s.duration_minutes)} min` })),
          h("span", { class: "price", text: price(s.price) }),
        ),
      ),
    ),
    all.length > items.length
      ? h("p", { class: "b2 muted", text: es() ? `${all.length - items.length} más: pide cualquier servicio por su nombre.` : `+${all.length - items.length} more — ask for any service by name.` })
      : null,
  ];
}

function viewMenu(d: Data) {
  const categories = arr(d.categories);
  const all: Data[] = categories.flatMap((c) => arr(c.items).map((i): Data => ({ ...i, category: str(c.category) })));
  if (all.length === 0) return emptyState(d, es() ? "Carta" : "Menu", "dishes");
  const items = all.slice(0, 12);
  const n = all.length;
  return [
    header(d, es() ? `Carta · ${n} ${n === 1 ? "plato" : "platos"}` : `Menu · ${n} ${n === 1 ? "dish" : "dishes"}`),
    h(
      "div",
      { class: `carousel${items.length > 3 ? " scrolls" : ""}` },
      ...items.map((m) =>
        tapTarget(
          "inner dishcard",
          es() ? `Háblame de ${str(m.name)}.` : `Tell me about the ${str(m.name)}.`,
          h("span", { class: "lbl clamp1", text: category(str(m.category)) }),
          h("span", { class: "h1 clamp2", text: str(m.name) }),
          h("span", { class: "b2 muted clamp3", text: described(m) }),
          h(
            "span",
            { class: "foot" },
            h("span", { class: "price", text: price(m.price) }),
            m.gluten_free ? h("span", { class: "badge", aria: es() ? "Sin gluten" : "Gluten-free", text: es() ? "SG" : "GF" }) : null,
          ),
        ),
      ),
    ),
    items.length > 3
      ? h(
          "p",
          { class: `b2 muted${all.length > items.length ? "" : " swipe"}` },
          // Phones stack the dishes instead of a carousel: no "swipe" there.
          h("span", { class: "swipe", text: es() ? (n > items.length ? "Desliza para ver más · " : "Desliza para ver más.") : n > items.length ? "Swipe for more · " : "Swipe for more." }),
          ...(n > items.length ? [es() ? `${n - items.length} más en la carta: pide un plato o una sección.` : `${n - items.length} more on the menu — ask for a dish or a category.`] : []),
        )
      : null,
  ];
}

function viewDish(d: Data) {
  const m = obj(d.dish);
  return [
    header(d, m.category ? category(str(m.category)) : es() ? "Plato" : "Dish"),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        { class: "col" },
        h("p", { class: "d2", text: str(m.name) }),
        h("p", { class: "b1 muted", text: described(m) }),
        h("p", { class: "d3 price", text: price(m.price) }),
      ),
      h(
        "div",
        { class: "col" },
        h(
          "div",
          { class: `inner flag ${m.is_gluten_free ? "ok" : "warn"}` },
          h("span", { class: "lbl", text: "Gluten" }),
          h("span", {
            class: "b1",
            text: es()
              ? m.is_gluten_free ? "Marcado sin gluten" : "No marcado sin gluten"
              : m.is_gluten_free ? "Listed as gluten-free" : "Not listed as gluten-free",
          }),
        ),
        h(
          "div",
          { class: `inner flag ${m.allergens_published ? "ok" : "warn"}` },
          h("span", { class: "lbl", text: es() ? "Alérgenos" : "Allergens" }),
          h(
            "span",
            { class: "b1" ,
              text: m.allergens_published
                ? arr<string>(m.declared_allergens).join(", ") || (es() ? "Ninguno declarado" : "None declared")
                : es() ? "No publicados: pregunta al personal" : "Not published — please ask the staff" },
          ),
        ),
      ),
    ),
  ];
}

function viewBusiness(d: Data) {
  const hours = arr(d.opening_hours);
  const today = str(obj(d.local_now).weekday);
  return [
    header({ business: d.name }, es() ? "Horario" : "Opening hours"),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        { class: "col" },
        h("p", { class: "b1", text: str(d.address) }),
        h("p", { class: "d3", text: str(d.phone) }),
        h("p", { class: "b2 muted", text: described(d) }),
      ),
      h(
        "div",
        { class: "inner week" },
        ...hours.map((r) =>
          h(
            "p",
            { class: `day ${str(r.day) === today ? "today" : ""} ${r.open ? "" : "closed"}` },
            h("span", { text: weekday(str(r.day)).slice(0, 3) }),
            h("span", { text: r.open ? str(r.hours) : es() ? "Cerrado" : "Closed" }),
          ),
        ),
      ),
    ),
  ];
}

function viewCancellation(d: Data) {
  return [
    header(d, es() ? "Cancelada" : "Cancelled"),
    h("p", { class: "d1", text: es() ? "Reserva cancelada" : "Booking cancelled" }),
    h("p", { class: "d3", text: `${niceDate(str(d.date))} · ${str(d.time)}` }),
    h("p", { class: "b1 muted", text: `${es() ? "Referencia" : "Reference"} ${str(d.reference)}` }),
  ];
}

function viewDirectory(d: Data) {
  const total = arr(d.businesses);
  const list = total.slice(0, 5);
  return [
    header({ business: "Barrio" }, es() ? `${total.length} ${total.length === 1 ? "negocio" : "negocios"}` : total.length === 1 ? "1 business" : `${total.length} businesses`),
    h(
      "div",
      { class: "list" },
      ...list.map((b) =>
        tapTarget(
          "inner item",
          es() ? `Háblame de ${str(b.name)}.` : `Tell me about ${str(b.name)}.`,
          h(
            "span",
            { class: "grow" },
            h("span", { class: "h1", text: str(b.name) }),
            h("span", { class: "b2 muted", text: str(b.address) }),
          ),
          h("span", { class: "lbl", text: str(b.type) === "restaurant" ? (es() ? "Restaurante" : "Restaurant") : es() ? "Con cita" : "Appointments" }),
        ),
      ),
    ),
  ];
}

/** What the server's error text tells the assistant to do isn't for the customer's eyes. */
function forCustomer(text: string) {
  return text.replace(/\s*(Ask the customer|Ask which|Ask for anything|Use find_businesses|Use YYYY-MM-DD)[^.]*\.?/g, "").trim();
}

function viewError(e: Data): (Node | null)[] {
  const code = str(e.code);
  const options = arr<unknown>(e.options ?? e.suggestions).filter((o): o is string => typeof o === "string").slice(0, 6);
  const times = arr<unknown>(e.alternatives).filter((t): t is string => typeof t === "string").slice(0, 6);
  const ambiguous = code.endsWith("_ambiguous");
  const title = ambiguous
    ? es() ? "¿Cuál?" : "Which one?"
    : code.endsWith("_not_found")
      ? es() ? "No encontrado" : "Not found"
      : times.length
        ? es() ? "Esa hora no está libre" : "That time isn't available"
        : es() ? "Lo siento" : "Sorry";
  const say = (o: string) =>
    es()
      ? code.startsWith("dish") ? `Háblame de ${o}.` : code.startsWith("service") ? `Quiero ${o}.` : `${o}, por favor.`
      : code.startsWith("dish") ? `Tell me about the ${o}.` : code.startsWith("service") ? `I'd like ${o}.` : `${o}, please.`;
  // In Spanish, a short line for the code: the server's (English) text is written for the assistant.
  const detail = es()
    ? ambiguous ? "Hay varias opciones. Elige una:" : code.endsWith("_not_found") ? (options.length ? "¿Quizá alguno de estos?" : "") : (ERRORS_ES.find(([re]) => re.test(code))?.[1] ?? "")
    : forCustomer(str(e.error));
  return [
    header({ business: str(e.business) || undefined }, ambiguous ? (es() ? "Elige una opción" : "Choose one") : es() ? "No se puede" : "Can't do that"),
    h("p", { class: "d2", text: title }),
    detail ? h("p", { class: "b1 muted", text: detail }) : null,
    options.length ? h("div", { class: "options" }, ...options.map((o) => tapTarget("inner opt", say(o), h("span", { class: "h1 clamp2", text: o })))) : null,
    times.length
      ? h(
          "div",
          {},
          h("span", { class: "lbl", text: es() ? "Libres cerca" : "Free nearby" }),
          h("div", { class: "chips" }, ...times.map((t) => chip(t, es() ? `Mejor a las ${t}, por favor.` : `Book ${t} instead, please.`))),
        )
      : null,
  ];
}

const VIEWS: Record<string, (d: Data) => (Node | null)[]> = {
  directory: viewDirectory,
  booking: viewBooking,
  availability: viewAvailability,
  services: viewServices,
  menu: viewMenu,
  dish: viewDish,
  business: viewBusiness,
  cancellation: viewCancellation,
};

/** True when the language changed, so the card has to be drawn again. */
function applyLocale() {
  const next: Lang = typeof ctx.locale === "string" && ctx.locale.toLowerCase().startsWith("es") ? "es" : "en";
  document.documentElement.lang = next;
  const changed = next !== lang;
  lang = next;
  return changed;
}

function applyContext() {
  const root = document.documentElement;
  const dark =
    ctx.theme === "dark" || (ctx.theme !== "light" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  // The frame we actually got (it changes when the host resizes us), else what the host said.
  const dims = ctx.containerDimensions as { width?: number; height?: number } | undefined;
  const width = window.innerWidth || (typeof ctx.maxWidth === "number" && ctx.maxWidth) || dims?.width || BASE_W;
  // Fit the height only when the host gives us a fixed frame. A host that sizes the iframe to our
  // reported content height would otherwise shrink us on every round trip.
  const fixedHeight = (typeof dims?.height === "number" && dims.height) || (typeof ctx.maxHeight === "number" && ctx.maxHeight) || 0;
  const height = fixedHeight ? Math.min(fixedHeight, window.innerHeight || fixedHeight) : 0;
  // Phones get a stacked layout at natural size; screen devices (Echo Show) get the 768×480 canvas
  // scaled with one root zoom. `deviceClass` is authoritative when the host provides it.
  const deviceClass = typeof ctx.deviceClass === "string" ? ctx.deviceClass.toLowerCase() : "";
  const knownScreen = deviceClass.includes("echo") || deviceClass.includes("show");
  const hostSaysMobile = !knownScreen && (ctx.isMobile === true || ctx.platform === "mobile" || deviceClass.includes("mobile"));
  const compact = hostSaysMobile || (!knownScreen && ctx.platform !== "desktop" && width < 560);
  root.dataset.layout = compact ? "compact" : "block";
  // Fit the whole canvas — width AND height — so a 16:9 Echo Show 15 never cuts off the bottom.
  const fit = height > 0 ? Math.min(width / BASE_W, height / BASE_H) : width / BASE_W;
  const stage = document.getElementById("stage");
  if (stage) (stage.style as CSSStyleDeclaration & { zoom: string }).zoom = compact ? "1" : String(Math.max(0.2, Math.min(3, fit)));
}

function render() {
  applyLocale();
  const stage = document.getElementById("stage")!;
  stage.replaceChildren();
  if (cancelled) {
    stage.append(
      h(
        "div",
        { class: "card" },
        header({}, es() ? "Detenido" : "Stopped"),
        h("p", { class: "d3", text: es() ? "Cancelado" : "Cancelled" }),
        h("p", { class: "b1 muted", text: es() ? "Vuelve a preguntar cuando quieras." : "Ask again whenever you like." }),
      ),
    );
  } else if (lastError) {
    stage.append(h("div", { class: "card v-error" }, ...viewError(lastError).filter((n): n is Node => Boolean(n))));
  } else if (!lastData) {
    stage.append(h("div", { class: "card" }, h("p", { class: "b1 muted", text: es() ? "Cargando…" : "Loading…" })));
  } else {
    const view = VIEWS[str(lastData.view)];
    const card = h("div", { class: `card v-${str(lastData.view, "unknown")}` });
    if (view) card.append(...view(lastData).filter((n): n is Node => Boolean(n)));
    else card.append(h("p", { class: "b1", text: es() ? "Hecho." : "Done." }));
    stage.append(card);
  }
  applyContext();
  enableRowScrolling(stage);
}

/** Swipe works on touch screens; a mouse wheel scrolls the rows sideways too. Marks rows that overflow. */
function enableRowScrolling(root: HTMLElement) {
  for (const row of root.querySelectorAll<HTMLElement>(".chiprow, .carousel.scrolls")) {
    const update = () => row.classList.toggle("overflows", row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
    row.addEventListener("scroll", update, { passive: true });
    row.addEventListener(
      "wheel",
      (e) => {
        if (row.scrollWidth <= row.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        row.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
    requestAnimationFrame(update);
  }
}

app.on("ui/notifications/tool-input", (params) => {
  lastInput = obj((params as { arguments?: unknown }).arguments);
});
app.on("ui/notifications/tool-result", (params) => {
  const p = params as { structuredContent?: Data; isError?: boolean; content?: { type?: string; text?: string }[] };
  cancelled = false;
  if (p.isError) {
    // Errors carry no structuredContent: read the JSON the server put in the text content.
    let parsed: Data = {};
    try {
      parsed = obj(JSON.parse(p.content?.find((c) => c.type === "text")?.text ?? "{}"));
    } catch {
      parsed = { error: p.content?.find((c) => c.type === "text")?.text ?? "" };
    }
    lastError = parsed;
    render();
    return;
  }
  const sc = p.structuredContent;
  if (sc && typeof sc === "object") {
    lastError = null;
    lastData = sc;
    businessName = str(sc.business ?? sc.name, businessName);
    render();
  }
});
app.on("ui/notifications/tool-cancelled", () => {
  cancelled = true;
  render();
});
app.on("ui/notifications/host-context-changed", (params) => {
  ctx = { ...ctx, ...(params as Ctx) };
  if (applyLocale()) render();
  else applyContext();
});
window.addEventListener("resize", applyContext);

render();
app
  .connect()
  .then(() => {
    ctx = { ...(app.hostContext as Ctx) };
    if (applyLocale()) render();
    else applyContext();
  })
  .catch(() => {});
