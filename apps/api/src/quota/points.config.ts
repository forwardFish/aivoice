import { POINTS_PRODUCT_DEFAULTS, type PointsProduct } from '@aivoice/contracts';

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export interface PointsConfig {
  signupBonusPoints: number;
  generationCost: number;
  product: PointsProduct;
}

export function loadPointsConfig(): PointsConfig {
  return {
    signupBonusPoints: positiveInteger('SIGNUP_BONUS_POINTS', 10),
    generationCost: positiveInteger('GENERATION_POINT_COST', 1),
    product: {
      productCode: String(process.env.POINTS_PACKAGE_CODE || POINTS_PRODUCT_DEFAULTS.productCode).trim(),
      amountFen: positiveInteger('POINTS_PACKAGE_PRICE_FEN', POINTS_PRODUCT_DEFAULTS.amountFen),
      points: positiveInteger('POINTS_PACKAGE_AMOUNT', POINTS_PRODUCT_DEFAULTS.points),
      validityDays: positiveInteger('POINTS_VALIDITY_DAYS', POINTS_PRODUCT_DEFAULTS.validityDays),
      autoRenew: false,
    },
  };
}
