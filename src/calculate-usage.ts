export type Plan = "pro" | "pro-plus" | "max" | "business" | "enterprise";

type PlanConfig = {
  label: string;
  includedCredits: number;
  pooled: boolean;
};

export type CsvRecord = Record<string, string>;

const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  pro: { label: "Copilot Pro", includedCredits: 1_500, pooled: false },
  "pro-plus": { label: "Copilot Pro+", includedCredits: 7_000, pooled: false },
  max: { label: "Copilot Max", includedCredits: 20_000, pooled: false },
  business: { label: "Copilot Business", includedCredits: 1_900, pooled: true },
  enterprise: { label: "Copilot Enterprise", includedCredits: 3_900, pooled: true },
};

const PROMOTIONAL_PLAN_CONFIGS: Partial<Record<Plan, PlanConfig>> = {
  business: { label: "Copilot Business promotional", includedCredits: 3_000, pooled: true },
  enterprise: { label: "Copilot Enterprise promotional", includedCredits: 7_000, pooled: true },
};

type Options = {
  csvPath: string;
  plan?: Plan;
  seats: number;
  promotional: boolean;
};

export type UsageTotals = {
  rows: number;
  aiCredits: number;
  grossAmountUsd: number;
};

async function main(): Promise<void> {
  const options = parseArgs(Deno.args);
  const csv = await Deno.readTextFile(options.csvPath);
  const records = parseCsv(csv);
  const totals = calculateTotals(records);

  printSummary(options, totals);
}

function parseArgs(args: string[]): Options {
  let csvPath = "";
  let plan: Plan | undefined;
  let seats = 1;
  let promotional = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      Deno.exit(0);
    }

    if (arg === "--plan") {
      plan = parsePlan(readRequiredValue(args, index += 1, "--plan"));
      continue;
    }

    if (arg === "--seats") {
      seats = parsePositiveInteger(readRequiredValue(args, index += 1, "--seats"), "--seats");
      continue;
    }

    if (arg === "--promotional") {
      promotional = true;
      continue;
    }

    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (csvPath !== "") {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    csvPath = arg;
  }

  if (csvPath === "") {
    throw new Error("CSV file path is required. Run with --help for usage.");
  }

  if (plan === undefined && seats !== 1) {
    throw new Error("--seats requires --plan business or --plan enterprise.");
  }

  if (plan !== undefined && !isPooledPlan(plan) && seats !== 1) {
    throw new Error("--seats can only be used with --plan business or --plan enterprise.");
  }

  if (promotional && plan !== "business" && plan !== "enterprise") {
    throw new Error("--promotional can only be used with --plan business or --plan enterprise.");
  }

  return { csvPath, plan, seats, promotional };
}

function readRequiredValue(args: string[], index: number, optionName: string): string {
  const value = args[index];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`${optionName} requires a value.`);
  }

  return value;
}

export function parsePlan(value: string): Plan {
  if (isPlan(value)) {
    return value;
  }

  throw new Error(
    `Unknown plan: ${value}. Supported plans: ${Object.keys(PLAN_CONFIGS).join(", ")}`,
  );
}

function isPlan(value: string): value is Plan {
  return Object.prototype.hasOwnProperty.call(PLAN_CONFIGS, value);
}

function isPooledPlan(plan: Plan): boolean {
  return PLAN_CONFIGS[plan].pooled;
}

export function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }

  return parsed;
}

export function parseCsv(csv: string): CsvRecord[] {
  const rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));

  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  const headers = rows[0].map((header) => header.trim());
  const missingHeaders = ["aic_quantity", "aic_gross_amount"].filter(
    (requiredHeader) => !headers.includes(requiredHeader),
  );

  if (missingHeaders.length > 0) {
    throw new Error(`CSV is missing required columns: ${missingHeaders.join(", ")}`);
  }

  return rows.slice(1).filter(hasAnyValue).map((row, rowIndex) => {
    const record: CsvRecord = {};

    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      record[headers[columnIndex]] = row[columnIndex] ?? "";
    }

    if (row.length > headers.length) {
      throw new Error(`Row ${rowIndex + 2} has more columns than the header row.`);
    }

    return record;
  });
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const nextChar = csv[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function hasAnyValue(row: string[]): boolean {
  return row.some((value) => value.trim() !== "");
}

export function calculateTotals(records: CsvRecord[]): UsageTotals {
  return records.reduce<UsageTotals>(
    (totals, record, index) => ({
      rows: totals.rows + 1,
      aiCredits: totals.aiCredits + parseNumber(record.aic_quantity, index + 2, "aic_quantity"),
      grossAmountUsd: totals.grossAmountUsd +
        parseNumber(record.aic_gross_amount, index + 2, "aic_gross_amount"),
    }),
    { rows: 0, aiCredits: 0, grossAmountUsd: 0 },
  );
}

function parseNumber(value: string, rowNumber: number, columnName: string): number {
  const normalized = value.trim().replace(/^\$/, "").replace(/,/g, "");

  if (normalized === "") {
    throw new Error(`Row ${rowNumber} column ${columnName} is empty.`);
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(
      `Row ${rowNumber} column ${columnName} must be a non-negative number: ${value}`,
    );
  }

  return parsed;
}

function printSummary(options: Options, totals: UsageTotals): void {
  const lines = [
    `CSV: ${basename(options.csvPath)}`,
    `Rows: ${totals.rows}`,
    `AI Credits used: ${formatNumber(totals.aiCredits)}`,
    `Estimated gross amount: ${formatUsd(totals.grossAmountUsd)}`,
  ];

  if (options.plan !== undefined) {
    const planConfig = resolvePlanConfig(options.plan, options.promotional);
    const includedCredits = planConfig.includedCredits * options.seats;
    const overageCredits = Math.max(totals.aiCredits - includedCredits, 0);
    const remainingCredits = Math.max(includedCredits - totals.aiCredits, 0);

    lines.push(
      `Plan: ${planConfig.label}`,
      `Seats: ${options.seats}`,
      `Included AI Credits: ${formatNumber(includedCredits)}`,
      `Remaining AI Credits: ${formatNumber(remainingCredits)}`,
      `Overage AI Credits: ${formatNumber(overageCredits)}`,
      `Estimated overage amount: ${formatUsd(overageCredits * 0.01)}`,
    );

    if (planConfig.pooled) {
      lines.push("Pooling: enabled at billing entity level");
    }
  }

  console.log(lines.join("\n"));
}

function basename(path: string): string {
  const normalizedPath = path.replaceAll("\\", "/");
  const lastSegment = normalizedPath.split("/").filter(Boolean).at(-1);

  return lastSegment ?? path;
}

function resolvePlanConfig(plan: Plan, promotional: boolean): PlanConfig {
  if (promotional) {
    const promotionalConfig = PROMOTIONAL_PLAN_CONFIGS[plan];

    if (promotionalConfig !== undefined) {
      return promotionalConfig;
    }
  }

  return PLAN_CONFIGS[plan];
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function printHelp(): void {
  console.log(`Usage: deno task calculate <usage-report.csv> [options]

Options:
  --plan <plan>     Compare against included credits.
                  Supported: pro, pro-plus, max, business, enterprise
  --seats <number>  Number of Business/Enterprise seats for a pooled estimate. Default: 1
                    Requires --plan business or --plan enterprise.
  --promotional     Use promotional Business/Enterprise credits for the first 3 months.
  -h, --help        Show this help.

Required CSV columns:
  aic_quantity      Used AI Credits
  aic_gross_amount  Estimated gross amount in USD`);
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    Deno.exit(1);
  });
}
