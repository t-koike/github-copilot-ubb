/** Usage report aggregation. */

import type { CsvRecord, CsvTable } from "./csv.ts";
import {
  abs,
  creditsToUsd,
  type Decimal,
  fromInteger,
  max,
  parseDecimal,
  ZERO,
} from "./decimal.ts";
import { type Plan, PLAN_CONFIGS } from "./plans.ts";

/**
 * - `preview`: billing preview report from the migration period (`aic_quantity`, `aic_gross_amount`).
 * - `usage`: current usage reports (`quantity`, `gross_amount`, optional `discount_amount` /
 *   `net_amount`), e.g. the AI usage report or a filtered metered usage report.
 */
export type ReportFormat = "preview" | "usage";

type ColumnMap = {
  quantity: string;
  grossAmount: string;
  discountAmount?: string;
  netAmount?: string;
};

const COLUMN_MAPS: Record<ReportFormat, ColumnMap> = {
  preview: { quantity: "aic_quantity", grossAmount: "aic_gross_amount" },
  usage: {
    quantity: "quantity",
    grossAmount: "gross_amount",
    discountAmount: "discount_amount",
    netAmount: "net_amount",
  },
};

export const GROUP_BY_COLUMNS = {
  date: "date",
  user: "username",
  model: "model",
  sku: "sku",
  product: "product",
  organization: "organization",
  "cost-center": "cost_center_name",
} as const;

export type GroupBy = keyof typeof GROUP_BY_COLUMNS;

export type Filters = {
  product?: string;
  sku?: string;
};

export type Totals = {
  rows: number;
  aiCredits: Decimal;
  grossAmount: Decimal;
  /** Only present when the report has the column. */
  discountAmount?: Decimal;
  /** Only present when the report has the column. */
  netAmount?: Decimal;
};

export type GroupTotals = Totals & { key: string };

export type UsageSummary = {
  format: ReportFormat;
  totals: Totals;
  groups?: GroupTotals[];
  warnings: string[];
};

export type PlanComparison = {
  plan: Plan;
  label: string;
  seats: number;
  pooled: boolean;
  includedCredits: Decimal;
  remainingCredits: Decimal;
  overageCredits: Decimal;
  overageAmount: Decimal;
};

export function detectFormat(headers: string[]): ReportFormat {
  const has = (column: string) => headers.includes(column);

  if (has("aic_quantity") && has("aic_gross_amount")) {
    return "preview";
  }

  if (has("quantity") && has("gross_amount")) {
    return "usage";
  }

  const missing = has("aic_quantity") || has("aic_gross_amount")
    ? ["aic_quantity", "aic_gross_amount"].filter((column) => !has(column))
    : ["quantity", "gross_amount"].filter((column) => !has(column));

  throw new Error(
    `CSV is missing required columns: ${missing.join(", ")}. ` +
      "Expected either aic_quantity + aic_gross_amount (billing preview report) " +
      "or quantity + gross_amount (usage / AI usage report).",
  );
}

export function summarizeUsage(
  table: CsvTable,
  options: { filters?: Filters; groupBy?: GroupBy } = {},
): UsageSummary {
  const format = detectFormat(table.headers);
  const columns = COLUMN_MAPS[format];
  const filters = options.filters ?? {};
  const warnings: string[] = [];

  for (const [name, column] of [["product", "product"], ["sku", "sku"]] as const) {
    if (filters[name] !== undefined && !table.headers.includes(column)) {
      throw new Error(`--${name} was specified but the CSV has no ${column} column.`);
    }
  }

  const groupColumn = options.groupBy === undefined ? undefined : GROUP_BY_COLUMNS[options.groupBy];
  if (groupColumn !== undefined && !table.headers.includes(groupColumn)) {
    throw new Error(`--group-by ${options.groupBy} requires a ${groupColumn} column in the CSV.`);
  }

  const selected = table.records
    .map((record, index) => ({ record, rowNumber: table.rowNumbers[index] }))
    .filter(({ record }) => matchesFilters(record, filters));

  if (format === "usage") {
    assertSingleProduct(table, selected.map(({ record }) => record), filters);
  }

  const hasDiscount = columns.discountAmount !== undefined &&
    table.headers.includes(columns.discountAmount);
  const hasNet = columns.netAmount !== undefined && table.headers.includes(columns.netAmount);

  const totals = emptyTotals(hasDiscount, hasNet);
  const groups = new Map<string, Totals>();

  for (const { record, rowNumber } of selected) {
    const row: Totals = {
      rows: 1,
      aiCredits: readValue(record, columns.quantity, rowNumber),
      grossAmount: readValue(record, columns.grossAmount, rowNumber),
    };
    if (hasDiscount) {
      row.discountAmount = readValue(record, columns.discountAmount!, rowNumber);
    }
    if (hasNet) {
      row.netAmount = readValue(record, columns.netAmount!, rowNumber);
    }

    addInto(totals, row);

    if (groupColumn !== undefined) {
      const key = record[groupColumn].trim() || "(empty)";
      const group = groups.get(key) ?? emptyTotals(hasDiscount, hasNet);
      addInto(group, row);
      groups.set(key, group);
    }
  }

  if (table.records.length === 0) {
    warnings.push("CSV has a header row but no usage rows.");
  } else if (selected.length === 0) {
    warnings.push("No rows matched the given --product / --sku filters.");
  }

  const mismatch = checkAmountConsistency(totals);
  if (mismatch !== undefined) {
    warnings.push(mismatch);
  }

  return {
    format,
    totals,
    groups: groupColumn === undefined ? undefined : [...groups.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    warnings,
  };
}

export function compareWithPlan(totals: Totals, plan: Plan, seats: number): PlanComparison {
  const config = PLAN_CONFIGS[plan];
  const includedCredits = fromInteger(config.includedCredits * seats);
  const overageCredits = max(totals.aiCredits - includedCredits, ZERO);

  return {
    plan,
    label: config.label,
    seats,
    pooled: config.pooled,
    includedCredits,
    remainingCredits: max(includedCredits - totals.aiCredits, ZERO),
    overageCredits,
    overageAmount: creditsToUsd(overageCredits),
  };
}

/**
 * Warns when the gross amount differs from AI Credits x $0.01 by more than 1% (and more than one
 * cent), which usually means the wrong rows/columns were aggregated (e.g. a non-Copilot SKU).
 */
export function checkAmountConsistency(totals: Totals): string | undefined {
  const expected = creditsToUsd(totals.aiCredits);
  const difference = abs(totals.grossAmount - expected);
  const oneCent = fromInteger(1) / 100n;
  const tolerance = max(oneCent, expected / 100n);

  if (difference <= tolerance) {
    return undefined;
  }

  return "Gross amount does not match AI Credits x $0.01 " +
    `(difference exceeds ${tolerance === oneCent ? "$0.01" : "1%"}). ` +
    "Check that only AI Credits rows are included.";
}

function matchesFilters(record: CsvRecord, filters: Filters): boolean {
  const equals = (actual: string | undefined, expected: string | undefined) =>
    expected === undefined || actual?.trim().toLowerCase() === expected.trim().toLowerCase();

  return equals(record.product, filters.product) && equals(record.sku, filters.sku);
}

/**
 * Metered usage reports mix products (Actions minutes, storage, AI Credits, ...). Summing their
 * `quantity` columns together is meaningless, so require a filter in that case.
 */
function assertSingleProduct(table: CsvTable, records: CsvRecord[], filters: Filters): void {
  if (filters.sku !== undefined) {
    return;
  }

  for (const column of ["product", "sku"] as const) {
    if (column === "product" && filters.product !== undefined) {
      continue;
    }
    if (!table.headers.includes(column)) {
      continue;
    }

    const values = [...new Set(records.map((record) => record[column].trim()).filter(Boolean))];
    if (values.length > 1) {
      throw new Error(
        `CSV contains multiple ${column} values (${values.sort().join(", ")}). ` +
          `Use --${column} <value> to select the AI Credits rows.`,
      );
    }
  }
}

function readValue(record: CsvRecord, column: string, rowNumber: number): Decimal {
  const raw = record[column] ?? "";

  if (raw.trim() === "") {
    throw new Error(`Row ${rowNumber} column ${column} is empty.`);
  }

  const parsed = parseDecimal(raw);
  if (parsed === undefined) {
    throw new Error(`Row ${rowNumber} column ${column} must be a non-negative number: ${raw}`);
  }

  return parsed;
}

function emptyTotals(hasDiscount: boolean, hasNet: boolean): Totals {
  const totals: Totals = { rows: 0, aiCredits: ZERO, grossAmount: ZERO };
  if (hasDiscount) totals.discountAmount = ZERO;
  if (hasNet) totals.netAmount = ZERO;
  return totals;
}

function addInto(target: Totals, row: Totals): void {
  target.rows += row.rows;
  target.aiCredits += row.aiCredits;
  target.grossAmount += row.grossAmount;
  if (target.discountAmount !== undefined) target.discountAmount += row.discountAmount ?? ZERO;
  if (target.netAmount !== undefined) target.netAmount += row.netAmount ?? ZERO;
}
