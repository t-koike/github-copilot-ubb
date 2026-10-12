/**
 * CLI: aggregate GitHub Copilot AI Credits from a usage report CSV.
 *
 *   deno task calculate <usage-report.csv> [--plan <plan>] [--seats <n>] [--json] ...
 */

import { parseCsvTable } from "./csv.ts";
import { formatNumber, formatUsd, toNumber } from "./decimal.ts";
import { isPooledPlan, parsePlan, type Plan, PLAN_NAMES } from "./plans.ts";
import {
  compareWithPlan,
  type Filters,
  GROUP_BY_COLUMNS,
  type GroupBy,
  type GroupTotals,
  type PlanComparison,
  summarizeUsage,
  type Totals,
  type UsageSummary,
} from "./usage.ts";

export { type CsvRecord, parseCsvTable } from "./csv.ts";
export { parsePlan, type Plan } from "./plans.ts";
export { compareWithPlan, detectFormat, summarizeUsage } from "./usage.ts";

export type Options = {
  csvPath: string;
  plan?: Plan;
  seats: number;
  json: boolean;
  groupBy?: GroupBy;
  filters: Filters;
  help: boolean;
};

const VALUE_OPTIONS = ["--plan", "--seats", "--group-by", "--product", "--sku"] as const;
type ValueOption = typeof VALUE_OPTIONS[number];

export function parseArgs(args: string[]): Options {
  const options: Options = { csvPath: "", seats: 1, json: false, filters: {}, help: false };
  let seatsSpecified = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      return options;
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const [name, inlineValue] = splitOption(arg);
    if (isValueOption(name)) {
      let value = inlineValue;
      if (value === undefined) {
        index += 1;
        value = args[index];
      }
      if (
        value === undefined || value === "" || (inlineValue === undefined && value.startsWith("-"))
      ) {
        throw new Error(`${name} requires a value.`);
      }

      switch (name) {
        case "--plan":
          options.plan = parsePlan(value);
          break;
        case "--seats":
          options.seats = parsePositiveInteger(value, "--seats");
          seatsSpecified = true;
          break;
        case "--group-by":
          options.groupBy = parseGroupBy(value);
          break;
        case "--product":
          options.filters.product = value;
          break;
        case "--sku":
          options.filters.sku = value;
          break;
      }
      continue;
    }

    if (arg.startsWith("-") && arg !== "-") {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (options.csvPath !== "") {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    options.csvPath = arg;
  }

  if (options.csvPath === "") {
    throw new Error("CSV file path is required. Run with --help for usage.");
  }

  if (seatsSpecified && (options.plan === undefined || !isPooledPlan(options.plan))) {
    throw new Error("--seats can only be used with --plan business or --plan enterprise.");
  }

  return options;
}

function splitOption(arg: string): [string, string | undefined] {
  const equalsIndex = arg.indexOf("=");
  if (!arg.startsWith("--") || equalsIndex === -1) {
    return [arg, undefined];
  }

  return [arg.slice(0, equalsIndex), arg.slice(equalsIndex + 1)];
}

function isValueOption(name: string): name is ValueOption {
  return (VALUE_OPTIONS as readonly string[]).includes(name);
}

export function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

function parseGroupBy(value: string): GroupBy {
  if (Object.prototype.hasOwnProperty.call(GROUP_BY_COLUMNS, value)) {
    return value as GroupBy;
  }

  throw new Error(
    `Unknown --group-by value: ${value}. Supported: ${Object.keys(GROUP_BY_COLUMNS).join(", ")}`,
  );
}

export function formatText(
  csvName: string,
  summary: UsageSummary,
  comparison: PlanComparison | undefined,
): string {
  const { totals } = summary;
  const lines = [
    `CSV: ${csvName}`,
    `Report format: ${
      summary.format === "preview" ? "billing preview (aic_*)" : "usage report (quantity)"
    }`,
    `Rows: ${totals.rows}`,
    `AI Credits used: ${formatNumber(totals.aiCredits)}`,
    `Gross amount: ${formatUsd(totals.grossAmount)}`,
  ];

  if (totals.discountAmount !== undefined) {
    lines.push(`Discount amount (included usage): ${formatUsd(totals.discountAmount)}`);
  }
  if (totals.netAmount !== undefined) {
    lines.push(`Net amount (billed): ${formatUsd(totals.netAmount)}`);
  }

  if (comparison !== undefined) {
    lines.push(
      `Plan: ${comparison.label}`,
      `Seats: ${comparison.seats}`,
      `Included AI Credits: ${formatNumber(comparison.includedCredits)}`,
      `Remaining AI Credits: ${formatNumber(comparison.remainingCredits)}`,
      `Overage AI Credits: ${formatNumber(comparison.overageCredits)}`,
      `Estimated overage amount: ${formatUsd(comparison.overageAmount)}`,
    );

    if (comparison.pooled) {
      lines.push("Pooling: enabled at billing entity level");
    }
  }

  if (summary.groups !== undefined) {
    lines.push("", ...formatGroupTable(summary.groups));
  }

  return lines.join("\n");
}

function formatGroupTable(groups: GroupTotals[]): string[] {
  const rows = [
    ["Key", "Rows", "AI Credits", "Gross amount"],
    ...groups.map((group) => [
      group.key,
      String(group.rows),
      formatNumber(group.aiCredits),
      formatUsd(group.grossAmount),
    ]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));

  return rows.map((row) =>
    row.map((cell, column) =>
      column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column])
    )
      .join("  ").trimEnd()
  );
}

export function toJson(
  csvName: string,
  summary: UsageSummary,
  comparison: PlanComparison | undefined,
): Record<string, unknown> {
  return {
    csv: csvName,
    format: summary.format,
    totals: totalsToJson(summary.totals),
    plan: comparison === undefined ? undefined : {
      plan: comparison.plan,
      label: comparison.label,
      seats: comparison.seats,
      pooled: comparison.pooled,
      includedCredits: toNumber(comparison.includedCredits),
      remainingCredits: toNumber(comparison.remainingCredits),
      overageCredits: toNumber(comparison.overageCredits),
      overageAmount: toNumber(comparison.overageAmount),
    },
    groups: summary.groups?.map((group) => ({ key: group.key, ...totalsToJson(group) })),
    warnings: summary.warnings,
  };
}

function totalsToJson(totals: Totals): Record<string, number | undefined> {
  const optional = (value: bigint | undefined) => value === undefined ? undefined : toNumber(value);

  return {
    rows: totals.rows,
    aiCredits: toNumber(totals.aiCredits),
    grossAmount: toNumber(totals.grossAmount),
    discountAmount: optional(totals.discountAmount),
    netAmount: optional(totals.netAmount),
  };
}

function basename(path: string): string {
  const lastSegment = path.replaceAll("\\", "/").split("/").filter(Boolean).at(-1);

  return lastSegment ?? path;
}

async function readInput(path: string): Promise<string> {
  if (path === "-") {
    return await new Response(Deno.stdin.readable).text();
  }

  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`CSV file not found: ${path}`);
    }
    throw error;
  }
}

export const HELP = `Usage: deno task calculate <usage-report.csv | -> [options]

Aggregates GitHub Copilot AI Credits from a usage report CSV ("-" reads stdin).

Options:
  --plan <plan>         Compare against included credits.
                        Supported: ${PLAN_NAMES.join(", ")}
  --seats <number>      Business/Enterprise seats for a pooled estimate. Default: 1
                        Requires --plan business or --plan enterprise.
  --product <value>     Only include rows whose product column matches (case-insensitive).
  --sku <value>         Only include rows whose sku column matches (case-insensitive).
  --group-by <key>      Break down totals by: ${Object.keys(GROUP_BY_COLUMNS).join(", ")}
  --json                Print machine-readable JSON.
  -h, --help            Show this help.

Options also accept the --option=value form.

Supported CSV formats:
  Billing preview report  aic_quantity, aic_gross_amount
  Usage / AI usage report quantity, gross_amount [, discount_amount, net_amount]`;

async function main(args: string[]): Promise<void> {
  const options = parseArgs(args);

  if (options.help) {
    console.log(HELP);
    return;
  }

  const table = parseCsvTable(await readInput(options.csvPath));
  const summary = summarizeUsage(table, { filters: options.filters, groupBy: options.groupBy });
  const comparison = options.plan === undefined
    ? undefined
    : compareWithPlan(summary.totals, options.plan, options.seats);
  const csvName = options.csvPath === "-" ? "(stdin)" : basename(options.csvPath);

  if (options.json) {
    console.log(JSON.stringify(toJson(csvName, summary, comparison), null, 2));
    return;
  }

  console.log(formatText(csvName, summary, comparison));
  for (const warning of summary.warnings) {
    console.error(`Warning: ${warning}`);
  }
}

if (import.meta.main) {
  main(Deno.args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  });
}
