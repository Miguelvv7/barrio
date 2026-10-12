import { describe, expect, it } from "vitest";
import { setup } from "./helpers";

describe("what customers actually say → which service", () => {
  it.each([
    ["Corte y Barba", "Corte y Barba"],
    ["corte y barba", "Corte y Barba"],
    ["corte con barba", "Corte y Barba"],
    ["corte peinado", "Corte y Peinado (sin barba)"],
    ["corte sin barba", "Corte y Peinado (sin barba)"],
    ["arreglo barba", "Arreglo de barba"],
    ["arreglo de la barba", "Arreglo de barba"],
    ["hair design", "Corte + Hair Design (dibujo)"],
    ["corte con dibujo", "Corte + Hair Design (dibujo)"],
  ])("%j → %s", async (spoken, expected) => {
    const { service, salon } = await setup();
    const r = await service.checkAvailability(salon, { date: "2026-10-20", service: spoken });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.service).toBe(expected);
  });
});
