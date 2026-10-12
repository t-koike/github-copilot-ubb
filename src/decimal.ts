/**
 * Fixed-point decimal helpers.
 *
 * Usage reports contain fractional AI Credits and sub-cent USD amounts, so values are held as
 * `bigint` scaled by 10^SCALE to avoid floating-point drift when summing many rows.
 */

/** Number of fractional digits kept internally. */
export const SCALE = 9;
const FACTOR = 10n ** BigInt(SCALE);

/** Fixed-point decimal value scaled by 10^SCALE. */
export type Decimal = bigint;

export const ZERO: Decimal = 0n;

/** Converts an integer number (e.g. a plan's included credits) to a Decimal. */
export function fromInteger(value: number): Decimal {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Not a safe integer: ${value}`);
  }

  return BigInt(value) * FACTOR;
}

/**
 * Parses a non-negative decimal string. Accepts a leading `$`, thousands separators and simple
 * scientific notation. Digits beyond SCALE are rounded half-up. Returns `undefined` when the
 * value is not a valid non-negative number.
 */
export function parseDecimal(value: string): Decimal | undefined {
  let normalized = value.trim().replace(/^\$/, "").replace(/,/g, "");

  if (/^\d*\.?\d+e[+-]?\d+$/i.test(normalized)) {
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return undefined;
    }
    normalized = parsed.toFixed(SCALE + 1);
  }

  const match = /^(\d+)(?:\.(\d*))?$|^\.(\d+)$/.exec(normalized);
  if (match === null) {
    return undefined;
  }

  const whole = match[1] ?? "0";
  const fraction = match[2] ?? match[3] ?? "";
  const kept = fraction.slice(0, SCALE).padEnd(SCALE, "0");
  const roundUp = fraction.length > SCALE && fraction[SCALE] >= "5";

  return BigInt(whole) * FACTOR + BigInt(kept) + (roundUp ? 1n : 0n);
}

/** Rounds half-up to the given number of fractional digits (0..SCALE). */
export function round(value: Decimal, digits: number): Decimal {
  const unit = 10n ** BigInt(SCALE - digits);
  const sign = value < 0n ? -1n : 1n;
  const abs = value * sign;

  return sign * ((abs + unit / 2n) / unit) * unit;
}

/** Plain decimal string without grouping, trimmed of trailing zeros (e.g. "1234.5"). */
export function toPlainString(value: Decimal, maxFractionDigits = SCALE): string {
  const rounded = round(value, maxFractionDigits);
  const negative = rounded < 0n;
  const abs = negative ? -rounded : rounded;
  const whole = (abs / FACTOR).toString();
  const fraction = (abs % FACTOR).toString().padStart(SCALE, "0").slice(0, maxFractionDigits)
    .replace(/0+$/, "");

  return `${negative ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}

/** Converts to a JavaScript number (for JSON output only). */
export function toNumber(value: Decimal): number {
  return Number(toPlainString(value));
}

/** Formats with en-US thousands separators. */
export function formatNumber(value: Decimal, maxFractionDigits = 2): string {
  const [whole, fraction] = toPlainString(value, maxFractionDigits).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Formats as USD with 2 decimals, e.g. "$1,234.50". */
export function formatUsd(value: Decimal): string {
  const negative = value < 0n;
  const [whole, fraction = ""] = formatNumber(negative ? -value : value, 2).split(".");

  return `${negative ? "-" : ""}$${whole}.${fraction.padEnd(2, "0")}`;
}

/** USD value of the given number of AI Credits (1 AI Credit = $0.01). */
export function creditsToUsd(credits: Decimal): Decimal {
  return credits / 100n;
}

export function max(a: Decimal, b: Decimal): Decimal {
  return a > b ? a : b;
}

export function abs(value: Decimal): Decimal {
  return value < 0n ? -value : value;
}
