/**
 * Demo tenants, built from each business's own public information:
 *  - Peluquería La Familia (Écija): services, prices, durations and opening hours from peluquerialafamilia.es
 *  - Restaurante El Rancho (Écija): dishes, descriptions, prices and the gluten-free list from its online menu.
 *
 * El Rancho does not publish opening hours or per-dish allergens. Hours below are a PLACEHOLDER
 * (confirm with the restaurant) and allergens are left undeclared on purpose: the assistant tells
 * customers to ask staff instead of guessing.
 */
import type { NewBusiness, NewMenuItem, NewService, OpeningInterval, Weekday } from "./types";

type SeedTenant = {
  business: NewBusiness;
  services: Omit<NewService, "businessId">[];
  menu: Omit<NewMenuItem, "businessId">[];
};

function week(days: Weekday[], ...ranges: [string, string][]): OpeningInterval[] {
  return days.flatMap((weekday) => ranges.map(([opens, closes]) => ({ weekday, opens, closes })));
}

const laFamilia: SeedTenant = {
  business: {
    slug: "la-familia",
    name: "Peluquería La Familia",
    kind: "salon",
    description:
      "Barbería en Écija: cortes, barba y diseños a máquina. En el Centro Comercial Las Torres, con aparcamiento.",
    address: "Avenida del Genil, Centro Comercial Las Torres, 41400 Écija (Sevilla)",
    phone: "+34 674 88 75 00",
    timezone: "Europe/Madrid",
    currency: "EUR",
    notifyEmail: "",
    capacity: 1,
    slotStepMinutes: 15,
    tableDurationMinutes: 0,
    maxPartySize: 1,
    hours: [
      ...week([1, 3], ["09:00", "14:00"], ["14:30", "18:00"]),
      ...week([2, 4], ["10:30", "14:30"], ["15:30", "19:00"]),
      ...week([5], ["10:30", "14:30"], ["15:30", "18:00"]),
    ],
  },
  services: [
    {
      name: "Corte y Peinado (sin barba)",
      description: "Corte de pelo y peinado.",
      durationMinutes: 30,
      price: 12,
      priceFrom: false,
      active: true,
      aliases: ["haircut", "men's haircut", "cut and style", "haircut without beard", "corte de pelo"],
    },
    {
      name: "Corte y Barba",
      description: "Corte de pelo y arreglo de barba.",
      durationMinutes: 45,
      price: 15,
      priceFrom: false,
      active: true,
      aliases: ["haircut and beard trim", "haircut and beard", "haircut and shave", "cut and beard", "full service"],
    },
    {
      name: "Arreglo de barba",
      description: "Perfilado y arreglo de barba.",
      durationMinutes: 15,
      price: 7,
      priceFrom: false,
      active: true,
      aliases: ["beard trim", "beard", "beard shape up", "shave", "afeitado"],
    },
    {
      name: "Corte + Hair Design (dibujo)",
      description: "Corte con dibujo a máquina. El precio final depende del diseño.",
      durationMinutes: 45,
      price: 17,
      priceFrom: true,
      active: true,
      aliases: ["hair design", "haircut with design", "hair tattoo", "hair art", "dibujo"],
    },
  ],
  menu: [],
};

function dish(
  category: string,
  name: string,
  description: string,
  price: number,
  glutenFree: boolean | null = null,
): Omit<NewMenuItem, "businessId"> {
  return { category, name, description, price, glutenFree, allergens: [], allergensDeclared: false, available: true };
}

const elRancho: SeedTenant = {
  business: {
    slug: "el-rancho",
    name: "Restaurante El Rancho",
    kind: "restaurant",
    description:
      "Restaurante Tex-Mex en Écija: hamburguesas de ternera gallega, tacos, fajitas, enchiladas y nachos.",
    address: "Av. del Genil, 6, 41400 Écija (Sevilla)",
    phone: "+34 620 380 984",
    timezone: "Europe/Madrid",
    currency: "EUR",
    notifyEmail: "",
    capacity: 8,
    slotStepMinutes: 30,
    tableDurationMinutes: 90,
    maxPartySize: 10,
    // PLACEHOLDER — El Rancho's menu site doesn't list opening hours. Confirm before going live.
    hours: week([2, 3, 4, 5, 6, 0], ["13:00", "16:30"], ["20:00", "23:30"]),
  },
  services: [],
  menu: [
    dish("Entrantes", "Patatas fritas del Rancho", "Patatas fritas de la casa.", 3.8, true),
    dish("Entrantes", "Chips & Beicon", "Patatas con mezcla de quesos, beicon y salsa ranchera.", 7.3, true),
    dish("Entrantes", "Patatas Cajún BBQ", "Patatas con especias cajún y barbacoa.", 4.9, true),
    dish("Entrantes", "Nachos Mezcal", "Jalapeños, cebolla morada, frijoles con carne, nata, tomate y mezcla de quesos.", 7.9, true),
    dish("Entrantes", "Cheddar Cheese Nachos", "Nachos con cheddar, jalapeño, guacamole y crema agria.", 7.5, true),
    dish("Entrantes", "Nachos Texanos", "Nachos, salsa de tomatillo, queso americano, nata, pepperoni, orégano y jalapeños.", 7.9, true),
    dish("Entrantes", "Alas de pollo", "Alitas barbacoa, picantes o extra picantes.", 6.5, true),
    dish("Entrantes", "Quesadilla Santa Mónica", "Beicon, york, cebolla morada, salsa ranchera y mezcla de quesos, con guacamole.", 7.9),
    dish("Entrantes", "Fried Jalapeños", "Jalapeños rellenos de cheddar con salsa.", 6.5),
    dish("Entrantes", "Tequeños", "Tequeños.", 6.5),
    dish("Entrantes", "Guacamole", "Guacamole con nachos de maíz.", 6.9, true),
    dish("Entrantes", "Chile con carne", "Frijoles con carne, tortillas y nachos.", 5.4),
    dish("Ensaladas", "Ensalada César", "Lechuga, pollo al horno, empanado, queso, beicon, picatostes y salsa césar.", 8.5),
    dish("Ensaladas", "Tijuana", "Lechuga mezclum, tomate cherry, pasas, nueces, cebolla crujiente y rulo de cabra gratinado con vinagreta de Pedro Ximénez.", 7.9, true),
    dish("Ensaladas", "Ensalada mixta de la casa", "Lechuga, huevo, tomate, atún y aceituna.", 8.2, true),
    dish("Enchiladas", "Enchilada Mole", "Enchilada de pollo con queso y salsa mole.", 6.9, true),
    dish("Enchiladas", "Enchilada Ranchera", "Enchilada de pollo con queso y salsa ranchera.", 6.9, true),
    dish("Enchiladas", "Texas Tornado", "Carne deshuesada con mezcla de quesos.", 7.4, true),
    dish("Tacos", "Taco Acapulco", "Pollo, lechuga, cebolla morada, zanahoria, pimiento, guacamole y salsa.", 7.9),
    dish("Tacos", "Taco Oregón", "Dúo de tacos de pollo, queso, lechuga, pico de gallo y alioli.", 7.9),
    dish("Tacos", "Chimichanga", "Frijoles con carne, aros de cebolla y guacamole.", 7.9),
    dish("Western", "Fajitas Vaqueras", "Pollo con tortitas para hacer los tacos.", 8.9),
    dish("Western", "Fajitas Vegetarianas", "Arroz, tomate, cebolla morada, zanahoria, maíz y lechuga.", 8.9),
    dish("Western", "Silverado", "Costilla al horno al estilo Willy.", 18.9, true),
    dish("Hamburguesas", "Burguer Obama", "Ternera gallega 200 g, champiñones, mayonesa de trufa y queso edam. Con patatas y pan de sésamo.", 12.5),
    dish("Hamburguesas", "Burguer Kansas", "Ternera gallega 200 g, tomate, cebolla, lechuga, guacamole y salsa de beicon. Con patatas y pan de sésamo.", 12.9),
    dish("Hamburguesas", "Burguer Montana", "Ternera gallega 200 g, queso americano, San Jacobo casero, pimiento verde y mayonesa de huevo frito.", 13.9),
    dish("Hamburguesas", "Jack Daniel's Burguer", "Ternera gallega 200 g, provolone, cebolla morada, salsa BBQ y Jack Daniel's.", 12.5),
    dish("Hamburguesas", "Burguer Serrana", "Ternera gallega, queso edam, alioli ligero, huevo, jamón serrano y queso curado.", 12.9),
    dish("Hamburguesas", "Chicken Cheddar", "Pollo empanado premium, queso americano, beicon, salsa chipotle y cheddar.", 12.9),
    dish("Postres", "Pasión de chocolate", "Postre de chocolate.", 5.2),
    dish("Postres", "Toffee Crunch", "Postre de toffee.", 5.2),
    dish("Bebidas", "Margarita", "Cóctel margarita.", 3.9),
    dish("Bebidas", "Refrescos", "Refresco.", 2.4),
  ],
};

export const SEED_TENANTS: SeedTenant[] = [laFamilia, elRancho];
