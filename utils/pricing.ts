export interface PricingInputs {
  basePriceGhs: number;
  pricePerKm: number;
  pricePerBag: number;
  distanceKm: number | null; // null when no matching collector was found — no distance charge can be attributed
  wasteBags: number | null; // AI Trash Estimator bin count, when available; null otherwise
  surgeMultiplier: number; // 1.0 = no surge
}

/**
 * Uber/Bolt-style dynamic price for one vehicle option. All configurable
 * inputs (base price, per-km rate, per-bag rate, surge multiplier) come
 * from the database (trash_vehicles / system_settings / surge_zones) —
 * nothing here is a hardcoded price.
 *
 * Waste-size charge only applies beyond the first bag/bin (the base price
 * already covers a baseline load), and only when a real bin count is known
 * (from the AI Trash Estimator) — never guessed.
 */
export function calculateVehiclePrice(inputs: PricingInputs): number {
  const distanceCharge = (inputs.distanceKm ?? 0) * inputs.pricePerKm;
  const extraBags = inputs.wasteBags != null ? Math.max(0, inputs.wasteBags - 1) : 0;
  const wasteSizeCharge = extraBags * inputs.pricePerBag;

  const subtotal = inputs.basePriceGhs + distanceCharge + wasteSizeCharge;
  const total = subtotal * inputs.surgeMultiplier;

  return Math.round(total * 100) / 100;
}
