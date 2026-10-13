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
 */
import { ViewBridge } from "./bridge";

type Data = Record<string, unknown> & { view?: string };
type Ctx = Record<string, unknown> & { theme?: string; displayMode?: string; platform?: string };

const BASE_W = 768;

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceDate(date: string, weekday?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return `${weekday ? `${weekday} ` : ""}${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

const app = new ViewBridge({ name: "barrio-card", version: "1.0.0" });
let lastData: Data | null = null;
let ctx: Ctx = {};

function ask(text: string) {
  void app.sendMessage(text).catch(() => {});
}

function header(data: Data, kicker: string) {
  return h(
    "header",
    { class: "hd" },
    h("span", { class: "mark", aria: "Barrio" }),
    h("span", { class: "biz", text: str(data.business ?? data.name, "Barrio") }),
    h("span", { class: "kicker", text: kicker }),
  );
}

function viewBooking(d: Data) {
  const b = obj(d.booking);
  const what = Number(b.party_size) > 1 || str(b.service) === "Table" ? `Table for ${str(b.party_size)}` : str(b.service);
  const ref = str(b.reference);
  return [
    header({ business: b.business }, "Booking confirmed"),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        { class: "col" },
        h("div", { class: "done", aria: "Confirmed", text: "✓" }),
        h("p", { class: "d1", text: "You're booked" }),
        h("p", { class: "d3", text: `${niceDate(str(b.date), str(b.weekday))} · ${str(b.time)}` }),
        h("p", { class: "b1", text: what }),
        h("p", { class: "b2 muted", text: str(b.address) }),
      ),
      h(
        "div",
        { class: "inner refbox" },
        h("p", { class: "lbl", text: "Reference" }),
        h("p", { class: "ref", aria: `Reference ${ref.split("").join(" ")}`, text: ref.split("").join(" ") }),
        h("p", { class: "b2 muted", text: `To change it, call ${str(b.phone)}` }),
      ),
    ),
  ];
}

function viewAvailability(d: Data) {
  const title = `${niceDate(str(d.date), str(d.weekday))} · ${str(d.service) === "Table" ? `Table for ${str(d.party_size)}` : str(d.service)}`;
  if (!d.available) {
    const next = arr(d.next_available).slice(0, 3);
    return [
      header(d, "No free times"),
      h("p", { class: "d3", text: title }),
      h("p", { class: "b1 muted", text: str(d.message) }),
      next.length
        ? h(
            "div",
            { class: "row3" },
            ...next.map((n) =>
              h(
                "button",
                { class: "inner tile", onClick: () => ask(`What about ${str(n.weekday)} ${str(n.date)}?`) },
                h("span", { class: "lbl", text: "Next free" }),
                h("span", { class: "h1", text: niceDate(str(n.date), str(n.weekday)) }),
                h("span", { class: "b1", text: `from ${str(n.first_time)}` }),
              ),
            ),
          )
        : null,
    ];
  }
  const times = arr<string>(d.start_times);
  const shown = times.slice(0, 11);
  return [
    header(d, "Free times"),
    h("p", { class: "d3", text: title }),
    h("p", { class: "b2 muted", text: `Tap a time to book · ${times.length} start times` }),
    h(
      "div",
      { class: "chips" },
      ...shown.map((t) =>
        h("button", { class: "chip", text: t, onClick: () => ask(`Book ${t} on ${str(d.weekday)} ${str(d.date)}, please.`) }),
      ),
      times.length > shown.length
        ? h("span", { class: "chip more", text: `+${times.length - shown.length}` })
        : null,
    ),
  ];
}

function viewServices(d: Data) {
  const items = arr(d.items).slice(0, 5);
  return [
    header(d, "Services"),
    h(
      "div",
      { class: "list" },
      ...items.map((s) =>
        h(
          "button",
          { class: "inner item", onClick: () => ask(`I'd like to book ${str(s.name)}.`) },
          h("span", { class: "grow" }, h("span", { class: "h1", text: str(s.name) }), h("span", { class: "b2 muted", text: `${str(s.duration_minutes)} min` })),
          h("span", { class: "price", text: str(s.price) }),
        ),
      ),
    ),
  ];
}

function viewMenu(d: Data) {
  const all: Data[] = arr(d.categories).flatMap((c) => arr(c.items).map((i): Data => ({ ...i, category: str(c.category) })));
  const items = all.slice(0, 5);
  return [
    header(d, all.length > items.length ? `Menu · ${all.length} dishes` : "Menu"),
    h(
      "div",
      { class: "carousel" },
      ...items.map((m) =>
        h(
          "button",
          { class: "inner dishcard", onClick: () => ask(`Tell me about the ${str(m.name)}.`) },
          h("span", { class: "lbl", text: str(m.category) }),
          h("span", { class: "h1 clamp2", text: str(m.name) }),
          h("span", { class: "b2 muted clamp3", text: str(m.description) }),
          h("span", { class: "foot" }, h("span", { class: "price", text: str(m.price) }), m.gluten_free ? h("span", { class: "badge", text: "GF" }) : null),
        ),
      ),
    ),
    all.length > items.length ? h("p", { class: "b2 muted", text: "Ask for a category — burgers, tacos, salads… — to see more." }) : null,
  ];
}

function viewDish(d: Data) {
  const m = obj(d.dish);
  return [
    header(d, str(m.category, "Dish")),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        { class: "col" },
        h("p", { class: "d2", text: str(m.name) }),
        h("p", { class: "b1 muted", text: str(m.description) }),
        h("p", { class: "d3 price", text: str(m.price) }),
      ),
      h(
        "div",
        { class: "col" },
        h(
          "div",
          { class: `inner flag ${m.is_gluten_free ? "ok" : "warn"}` },
          h("span", { class: "lbl", text: "Gluten" }),
          h("span", { class: "b1", text: m.is_gluten_free ? "Listed as gluten-free" : "Not listed as gluten-free" }),
        ),
        h(
          "div",
          { class: `inner flag ${m.allergens_published ? "ok" : "warn"}` },
          h("span", { class: "lbl", text: "Allergens" }),
          h(
            "span",
            { class: "b1" ,
              text: m.allergens_published
                ? arr<string>(m.declared_allergens).join(", ") || "None declared"
                : "Not published — please ask the staff" },
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
    header({ business: d.name }, "Opening hours"),
    h(
      "div",
      { class: "split" },
      h(
        "div",
        { class: "col" },
        h("p", { class: "b1", text: str(d.address) }),
        h("p", { class: "d3", text: str(d.phone) }),
        h("p", { class: "b2 muted", text: str(d.description) }),
      ),
      h(
        "div",
        { class: "inner week" },
        ...hours.map((r) =>
          h(
            "p",
            { class: `day ${str(r.day) === today ? "today" : ""} ${r.open ? "" : "closed"}` },
            h("span", { text: str(r.day).slice(0, 3) }),
            h("span", { text: r.open ? str(r.hours) : "Closed" }),
          ),
        ),
      ),
    ),
  ];
}

function viewCancellation(d: Data) {
  return [
    header(d, "Cancelled"),
    h("p", { class: "d1", text: "Booking cancelled" }),
    h("p", { class: "d3", text: `${niceDate(str(d.date))} · ${str(d.time)}` }),
    h("p", { class: "b1 muted", text: `Reference ${str(d.reference)}` }),
  ];
}

function viewDirectory(d: Data) {
  const list = arr(d.businesses).slice(0, 5);
  return [
    header({ business: "Barrio" }, list.length === 1 ? "1 business" : `${list.length} businesses`),
    h(
      "div",
      { class: "list" },
      ...list.map((b) =>
        h(
          "button",
          { class: "inner item", onClick: () => ask(`Tell me about ${str(b.name)}.`) },
          h(
            "span",
            { class: "grow" },
            h("span", { class: "h1", text: str(b.name) }),
            h("span", { class: "b2 muted", text: str(b.address) }),
          ),
          h("span", { class: "lbl", text: str(b.type) === "restaurant" ? "Restaurant" : "Appointments" }),
        ),
      ),
    ),
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

function applyContext() {
  const root = document.documentElement;
  const dark =
    ctx.theme === "dark" || (ctx.theme !== "light" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  const width =
    (typeof ctx.maxWidth === "number" && ctx.maxWidth) ||
    (ctx.containerDimensions as { width?: number; maxWidth?: number } | undefined)?.width ||
    window.innerWidth;
  // Phones get a stacked layout at natural size; screen devices (Echo Show) get the 768×480 canvas
  // scaled with one root zoom. `deviceClass` is authoritative when the host provides it.
  const deviceClass = typeof ctx.deviceClass === "string" ? ctx.deviceClass.toLowerCase() : "";
  const hostSaysMobile = ctx.isMobile === true || ctx.platform === "mobile" || deviceClass.includes("mobile");
  const knownScreen = deviceClass.includes("echo") || deviceClass.includes("show") || ctx.platform === "desktop";
  const compact = hostSaysMobile || (!knownScreen && width < 560);
  root.dataset.layout = compact ? "compact" : "block";
  const stage = document.getElementById("stage");
  if (stage) (stage.style as CSSStyleDeclaration & { zoom: string }).zoom = compact ? "1" : String(Math.max(0.5, Math.min(3, width / BASE_W)));
}

function render() {
  const stage = document.getElementById("stage")!;
  stage.replaceChildren();
  if (!lastData) {
    stage.append(h("div", { class: "card" }, h("p", { class: "b1 muted", text: "Loading…" })));
    return;
  }
  const view = VIEWS[str(lastData.view)];
  const card = h("div", { class: `card v-${str(lastData.view, "unknown")}` });
  if (view) card.append(...view(lastData).filter((n): n is Node => Boolean(n)));
  else card.append(h("p", { class: "b1", text: "Done." }));
  stage.append(card);
  applyContext();
}

app.on("ui/notifications/tool-result", (params) => {
  const sc = (params as { structuredContent?: Data }).structuredContent;
  if (sc && typeof sc === "object") {
    lastData = sc;
    render();
  }
});
app.on("ui/notifications/host-context-changed", (params) => {
  ctx = { ...ctx, ...(params as Ctx) };
  applyContext();
});
window.addEventListener("resize", applyContext);

render();
app
  .connect()
  .then(() => {
    ctx = { ...(app.hostContext as Ctx) };
    applyContext();
  })
  .catch(() => {});
