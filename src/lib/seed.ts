/**
 * Demo tenants, built from each business's own public information:
 *  - Peluquería La Familia (Écija): services, prices, durations and opening hours from peluquerialafamilia.es
 *  - Restaurante El Rancho (Écija): dishes, descriptions, prices and the gluten-free list from its online menu.
 *
 * Two of El Rancho's burgers are named after a brand and a person on its real menu; the demo lists
 * them with generic names (same dishes, same prices), so the public demo carries no third-party marks.
 * El Rancho doesn't publish opening hours or per-dish allergens: its hours below come from the owner,
 * and allergens are left undeclared on purpose: the assistant tells customers to ask staff instead
 * of guessing. The English descriptions are straight translations of the businesses' own Spanish
 * text: nothing added.
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
    descriptionEn: "Barbershop in Écija: haircuts, beards and clipper designs. In the Las Torres shopping centre, with parking.",
    address: "Avenida del Genil, Centro Comercial Las Torres, 41400 Écija (Sevilla)",
    phone: "+34 674 88 75 00",
    timezone: "Europe/Madrid",
    currency: "EUR",
    notifyEmail: "",
    trusted: true,
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
      descriptionEn: "Haircut and styling.",
      durationMinutes: 30,
      price: 12,
      priceFrom: false,
      active: true,
      aliases: ["haircut", "men's haircut", "cut and style", "haircut without beard", "corte de pelo"],
    },
    {
      name: "Corte y Barba",
      description: "Corte de pelo y arreglo de barba.",
      descriptionEn: "Haircut and beard trim.",
      durationMinutes: 45,
      price: 15,
      priceFrom: false,
      active: true,
      aliases: ["haircut and beard trim", "haircut and beard", "haircut and shave", "cut and beard", "full service"],
    },
    {
      name: "Arreglo de barba",
      description: "Perfilado y arreglo de barba.",
      descriptionEn: "Beard shaping and trim.",
      durationMinutes: 15,
      price: 7,
      priceFrom: false,
      active: true,
      aliases: ["beard trim", "beard", "beard shape up", "shave", "afeitado"],
    },
    {
      name: "Corte + Hair Design (dibujo)",
      description: "Corte con dibujo a máquina. El precio final depende del diseño.",
      descriptionEn: "Haircut with a clipper design. The final price depends on the design.",
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
  [description, descriptionEn]: [string, string],
  price: number,
  glutenFree: boolean | null = null,
): Omit<NewMenuItem, "businessId"> {
  return { category, name, description, descriptionEn, price, glutenFree, allergens: [], allergensDeclared: false, available: true };
}

const elRancho: SeedTenant = {
  business: {
    slug: "el-rancho",
    name: "Restaurante El Rancho",
    kind: "restaurant",
    description:
      "Restaurante Tex-Mex en Écija: hamburguesas de ternera gallega, tacos, fajitas, enchiladas y nachos.",
    descriptionEn: "Tex-Mex restaurant in Écija: Galician beef burgers, tacos, fajitas, enchiladas and nachos.",
    address: "Av. del Genil, 6, 41400 Écija (Sevilla)",
    phone: "+34 620 380 984",
    timezone: "Europe/Madrid",
    currency: "EUR",
    notifyEmail: "",
    trusted: true,
    capacity: 8,
    slotStepMinutes: 30,
    tableDurationMinutes: 90,
    maxPartySize: 10,
    // Confirmed by the owner (October 2026). Closed Monday to Wednesday.
    hours: [
      { weekday: 4, opens: "19:00", closes: "24:00" },
      { weekday: 5, opens: "12:00", closes: "16:00" },
      { weekday: 5, opens: "19:00", closes: "23:30" },
      { weekday: 6, opens: "12:00", closes: "16:00" },
      { weekday: 6, opens: "19:00", closes: "24:00" },
      { weekday: 0, opens: "12:00", closes: "16:00" },
      { weekday: 0, opens: "19:00", closes: "24:00" },
    ],
  },
  services: [],
  menu: [
    dish("Entrantes", "Patatas fritas del Rancho", ["Patatas fritas de la casa.", "House fries."],3.8, true),
    dish("Entrantes", "Chips & Beicon", ["Patatas con mezcla de quesos, beicon y salsa ranchera.", "Fries with mixed cheeses, bacon and ranchera sauce."],7.3, true),
    dish("Entrantes", "Patatas Cajún BBQ", ["Patatas con especias cajún y barbacoa.", "Fries with Cajun spices and barbecue sauce."],4.9, true),
    dish("Entrantes", "Nachos Mezcal", ["Jalapeños, cebolla morada, frijoles con carne, nata, tomate y mezcla de quesos.", "Jalapeños, red onion, beans with meat, cream, tomato and mixed cheeses."],7.9, true),
    dish("Entrantes", "Cheddar Cheese Nachos", ["Nachos con cheddar, jalapeño, guacamole y crema agria.", "Nachos with cheddar, jalapeño, guacamole and sour cream."],7.5, true),
    dish("Entrantes", "Nachos Texanos", ["Nachos, salsa de tomatillo, queso americano, nata, pepperoni, orégano y jalapeños.", "Nachos, tomatillo sauce, American cheese, cream, pepperoni, oregano and jalapeños."],7.9, true),
    dish("Entrantes", "Alas de pollo", ["Alitas barbacoa, picantes o extra picantes.", "Chicken wings: barbecue, hot or extra hot."],6.5, true),
    dish("Entrantes", "Quesadilla Santa Mónica", ["Beicon, york, cebolla morada, salsa ranchera y mezcla de quesos, con guacamole.", "Bacon, ham, red onion, ranchera sauce and mixed cheeses, with guacamole."],7.9),
    dish("Entrantes", "Fried Jalapeños", ["Jalapeños rellenos de cheddar con salsa.", "Cheddar-stuffed jalapeños with sauce."],6.5),
    dish("Entrantes", "Tequeños", ["Tequeños.", "Tequeños."],6.5),
    dish("Entrantes", "Guacamole", ["Guacamole con nachos de maíz.", "Guacamole with corn nachos."],6.9, true),
    dish("Entrantes", "Chile con carne", ["Frijoles con carne, tortillas y nachos.", "Beans with meat, tortillas and nachos."],5.4),
    dish("Ensaladas", "Ensalada César", ["Lechuga, pollo al horno, empanado, queso, beicon, picatostes y salsa césar.", "Lettuce, roast chicken, breaded chicken, cheese, bacon, croutons and Caesar dressing."],8.5),
    dish("Ensaladas", "Tijuana", ["Lechuga mezclum, tomate cherry, pasas, nueces, cebolla crujiente y rulo de cabra gratinado con vinagreta de Pedro Ximénez.", "Mixed leaves, cherry tomatoes, raisins, walnuts, crispy onion and grilled goat's cheese with Pedro Ximénez vinaigrette."],7.9, true),
    dish("Ensaladas", "Ensalada mixta de la casa", ["Lechuga, huevo, tomate, atún y aceituna.", "Lettuce, egg, tomato, tuna and olives."],8.2, true),
    dish("Enchiladas", "Enchilada Mole", ["Enchilada de pollo con queso y salsa mole.", "Chicken enchilada with cheese and mole sauce."],6.9, true),
    dish("Enchiladas", "Enchilada Ranchera", ["Enchilada de pollo con queso y salsa ranchera.", "Chicken enchilada with cheese and ranchera sauce."],6.9, true),
    dish("Enchiladas", "Texas Tornado", ["Carne deshuesada con mezcla de quesos.", "Boneless meat with mixed cheeses."],7.4, true),
    dish("Tacos", "Taco Acapulco", ["Pollo, lechuga, cebolla morada, zanahoria, pimiento, guacamole y salsa.", "Chicken, lettuce, red onion, carrot, pepper, guacamole and sauce."],7.9),
    dish("Tacos", "Taco Oregón", ["Dúo de tacos de pollo, queso, lechuga, pico de gallo y alioli.", "Two chicken tacos with cheese, lettuce, pico de gallo and aioli."],7.9),
    dish("Tacos", "Chimichanga", ["Frijoles con carne, aros de cebolla y guacamole.", "Beans with meat, onion rings and guacamole."],7.9),
    dish("Western", "Fajitas Vaqueras", ["Pollo con tortitas para hacer los tacos.", "Chicken with tortillas to build your own tacos."],8.9),
    dish("Western", "Fajitas Vegetarianas", ["Arroz, tomate, cebolla morada, zanahoria, maíz y lechuga.", "Rice, tomato, red onion, carrot, sweetcorn and lettuce."],8.9),
    dish("Western", "Silverado", ["Costilla al horno al estilo Willy.", "Oven-baked ribs, Willy style."],18.9, true),
    dish("Hamburguesas", "Burguer Trufa", ["Ternera gallega 200 g, champiñones, mayonesa de trufa y queso edam. Con patatas y pan de sésamo.", "200 g Galician beef, mushrooms, truffle mayonnaise and Edam cheese. With fries and a sesame bun."],12.5),
    dish("Hamburguesas", "Burguer Kansas", ["Ternera gallega 200 g, tomate, cebolla, lechuga, guacamole y salsa de beicon. Con patatas y pan de sésamo.", "200 g Galician beef, tomato, onion, lettuce, guacamole and bacon sauce. With fries and a sesame bun."],12.9),
    dish("Hamburguesas", "Burguer Montana", ["Ternera gallega 200 g, queso americano, San Jacobo casero, pimiento verde y mayonesa de huevo frito.", "200 g Galician beef, American cheese, homemade San Jacobo, green pepper and fried-egg mayonnaise."],13.9),
    dish("Hamburguesas", "Burguer Whiskey BBQ", ["Ternera gallega 200 g, provolone, cebolla morada, salsa BBQ y whiskey.", "200 g Galician beef, provolone, red onion, BBQ sauce and whiskey."],12.5),
    dish("Hamburguesas", "Burguer Serrana", ["Ternera gallega, queso edam, alioli ligero, huevo, jamón serrano y queso curado.", "Galician beef, Edam cheese, light aioli, egg, Serrano ham and cured cheese."],12.9),
    dish("Hamburguesas", "Chicken Cheddar", ["Pollo empanado premium, queso americano, beicon, salsa chipotle y cheddar.", "Premium breaded chicken, American cheese, bacon, chipotle sauce and cheddar."],12.9),
    dish("Postres", "Pasión de chocolate", ["Postre de chocolate.", "Chocolate dessert."],5.2),
    dish("Postres", "Toffee Crunch", ["Postre de toffee.", "Toffee dessert."],5.2),
    dish("Bebidas", "Margarita", ["Cóctel margarita.", "Margarita cocktail."],3.9),
    dish("Bebidas", "Refrescos", ["Refresco.", "Soft drink."],2.4),
  ],
};

export const SEED_TENANTS: SeedTenant[] = [laFamilia, elRancho];
