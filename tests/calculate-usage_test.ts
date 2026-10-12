import {
  compareWithPlan,
  formatText,
  parseArgs,
  parseCsvTable,
  parsePlan,
  parsePositiveInteger,
  summarizeUsage,
  toJson,
} from "../src/calculate-usage.ts";
import { formatNumber, formatUsd, parseDecimal, toPlainString } from "../src/decimal.ts";

const summarize = (csv: string, options?: Parameters<typeof summarizeUsage>[1]) =>
  summarizeUsage(parseCsvTable(csv), options);

// --- CSV parsing ---------------------------------------------------------------------------

Deno.test("parseCsvTable handles BOM, quoted fields, and CRLF", () => {
  const { records } = parseCsvTable(
    '\uFEFFaic_quantity,aic_gross_amount,note\r\n1,2.50,"hello, world"\r\n"2","$3.50",ok\r\n',
  );

  assertEquals(records, [
    { aic_quantity: "1", aic_gross_amount: "2.50", note: "hello, world" },
    { aic_quantity: "2", aic_gross_amount: "$3.50", note: "ok" },
  ]);
});

Deno.test("parseCsvTable skips blank lines and keeps original row numbers", () => {
  const table = parseCsvTable("aic_quantity,aic_gross_amount\n\n1,0.01\n");

  assertEquals(table.rowNumbers, [3]);
  assertThrows(
    () => summarizeUsage(parseCsvTable("aic_quantity,aic_gross_amount\n\n1,x\n")),
    "Row 3 column aic_gross_amount",
  );
});

Deno.test("parseCsvTable rejects malformed rows and quotes", () => {
  assertThrows(
    () => parseCsvTable("a,b\n1,2,3\n"),
    "Row 2 has more columns than the header row.",
  );
  assertThrows(() => parseCsvTable('a,b\n"1,2\n'), "unterminated quoted field");
  assertThrows(() => parseCsvTable('a,b\n"1"x,2\n'), "characters after a closing quote");
  assertThrows(() => parseCsvTable('a,b\nab"cd,2\n'), "quote inside an unquoted field");
  assertThrows(() => parseCsvTable(""), "CSV is empty.");
});

Deno.test("parseCsvTable rejects empty and duplicate headers", () => {
  assertThrows(() => parseCsvTable("a,,b\n1,2,3\n"), "CSV contains an empty header.");
  assertThrows(() => parseCsvTable("a,a,b\n1,2,3\n"), "CSV contains duplicate headers: a");
});

// --- Decimal -------------------------------------------------------------------------------

Deno.test("parseDecimal handles currency, grouping, fractions, and exponents", () => {
  assertEquals(toPlainString(parseDecimal("$1,234.50")!), "1234.5");
  assertEquals(toPlainString(parseDecimal("0.00385")!), "0.00385");
  assertEquals(toPlainString(parseDecimal(".5")!), "0.5");
  assertEquals(toPlainString(parseDecimal("1e-5")!), "0.00001");
  assertEquals(toPlainString(parseDecimal("0.1234567895")!), "0.12345679");
  assertEquals(parseDecimal("-1"), undefined);
  assertEquals(parseDecimal("abc"), undefined);
  assertEquals(parseDecimal("1.2.3"), undefined);
});

Deno.test("formatters round half-up and group thousands", () => {
  assertEquals(formatUsd(parseDecimal("1234.005")!), "$1,234.01");
  assertEquals(formatUsd(parseDecimal("0")!), "$0.00");
  assertEquals(formatNumber(parseDecimal("1234567.891")!), "1,234,567.89");
});

// --- Aggregation ---------------------------------------------------------------------------

Deno.test("summarizeUsage sums billing preview reports", () => {
  const summary = summarize("aic_quantity,aic_gross_amount\n1000,$10.00\n250,2.50\n");

  assertEquals(summary.format, "preview");
  assertEquals(summary.totals.rows, 2);
  assertEquals(toPlainString(summary.totals.aiCredits), "1250");
  assertEquals(toPlainString(summary.totals.grossAmount), "12.5");
  assertEquals(summary.warnings, []);
});

Deno.test("summarizeUsage sums sub-cent amounts without floating-point drift", () => {
  const rows = Array.from({ length: 10 }, () => "0.1,0.001").join("\n");
  const summary = summarize(`aic_quantity,aic_gross_amount\n${rows}\n`);

  assertEquals(toPlainString(summary.totals.aiCredits), "1");
  assertEquals(toPlainString(summary.totals.grossAmount), "0.01");
});

Deno.test("summarizeUsage supports current AI usage reports with net amounts", () => {
  const csv = [
    "date,username,model,quantity,gross_amount,discount_amount,net_amount",
    "2026-10-01,alice,gpt-5.4,100,1.00,1.00,0",
    "2026-10-01,bob,claude-sonnet-4.6,50.5,0.505,0.25,0.255",
    "2026-10-02,alice,gpt-5.4,20,0.20,0,0.20",
  ].join("\n");
  const summary = summarize(csv, { groupBy: "user" });

  assertEquals(summary.format, "usage");
  assertEquals(toPlainString(summary.totals.aiCredits), "170.5");
  assertEquals(toPlainString(summary.totals.netAmount!), "0.455");
  assertEquals(toPlainString(summary.totals.discountAmount!), "1.25");
  assertEquals(summary.groups!.map((group) => group.key), ["alice", "bob"]);
  assertEquals(toPlainString(summary.groups![0].aiCredits), "120");
});

Deno.test("summarizeUsage requires a filter for mixed-product reports", () => {
  const csv = [
    "product,sku,quantity,gross_amount",
    "actions,actions_linux,120,0.96",
    "copilot,copilot_ai_credits,300,3.00",
  ].join("\n");

  assertThrows(() => summarize(csv), "Use --product <value>");

  const summary = summarize(csv, { filters: { product: "Copilot" } });
  assertEquals(summary.totals.rows, 1);
  assertEquals(toPlainString(summary.totals.aiCredits), "300");
});

Deno.test("summarizeUsage reports missing columns for both formats", () => {
  assertThrows(() => summarize("aic_quantity\n1\n"), "missing required columns: aic_gross_amount");
  assertThrows(() => summarize("foo\n1\n"), "missing required columns: quantity, gross_amount");
  assertThrows(
    () => summarize("aic_quantity,aic_gross_amount\n1,2\n", { groupBy: "user" }),
    "--group-by user requires a username column",
  );
  assertThrows(
    () => summarize("aic_quantity,aic_gross_amount\n1,2\n", { filters: { sku: "x" } }),
    "no sku column",
  );
});

Deno.test("summarizeUsage rejects empty and negative values", () => {
  assertThrows(
    () => summarize("aic_quantity,aic_gross_amount\n,1\n"),
    "Row 2 column aic_quantity is empty.",
  );
  assertThrows(
    () => summarize("aic_quantity,aic_gross_amount\n-1,1\n"),
    "must be a non-negative number",
  );
});

Deno.test("summarizeUsage warns on empty data and amount mismatch", () => {
  assertEquals(summarize("aic_quantity,aic_gross_amount\n").warnings, [
    "CSV has a header row but no usage rows.",
  ]);

  const mismatch = summarize("aic_quantity,aic_gross_amount\n100,5.00\n");
  assertEquals(mismatch.warnings.length, 1);
  assertIncludes(mismatch.warnings[0], "does not match AI Credits x $0.01");
});

// --- Plan comparison -----------------------------------------------------------------------

Deno.test("compareWithPlan computes remaining and overage credits", () => {
  const { totals } = summarize("aic_quantity,aic_gross_amount\n2000.5,20.005\n");
  const pro = compareWithPlan(totals, "pro", 1);

  assertEquals(toPlainString(pro.includedCredits), "1500");
  assertEquals(toPlainString(pro.overageCredits), "500.5");
  assertEquals(toPlainString(pro.overageAmount), "5.005");
  assertEquals(toPlainString(pro.remainingCredits), "0");

  const business = compareWithPlan(totals, "business", 100);
  assertEquals(toPlainString(business.includedCredits), "190000");
  assertEquals(business.pooled, true);
});

// --- CLI -----------------------------------------------------------------------------------

Deno.test("parseArgs supports separate and inline option values", () => {
  const options = parseArgs([
    "usage.csv",
    "--plan=business",
    "--seats",
    "10",
    "--group-by=model",
    "--sku",
    "copilot_ai_credits",
    "--json",
  ]);

  assertEquals(options.csvPath, "usage.csv");
  assertEquals(options.plan, "business");
  assertEquals(options.seats, 10);
  assertEquals(options.groupBy, "model");
  assertEquals(options.filters, { sku: "copilot_ai_credits" });
  assertEquals(options.json, true);
  assertEquals(parseArgs(["-"]).csvPath, "-");
  assertEquals(parseArgs(["--help"]).help, true);
});

Deno.test("parseArgs validates options", () => {
  assertThrows(() => parseArgs([]), "CSV file path is required");
  assertThrows(() => parseArgs(["a.csv", "--plan"]), "--plan requires a value.");
  assertThrows(() => parseArgs(["a.csv", "--plan="]), "--plan requires a value.");
  assertThrows(() => parseArgs(["a.csv", "--bogus"]), "Unknown option: --bogus");
  assertThrows(() => parseArgs(["a.csv", "b.csv"]), "Unexpected argument: b.csv");
  assertThrows(() => parseArgs(["a.csv", "--group-by", "team"]), "Unknown --group-by value");
  assertThrows(
    () => parseArgs(["a.csv", "--plan", "pro", "--seats", "2"]),
    "--seats can only be used with --plan business or --plan enterprise.",
  );
  assertThrows(
    () => parseArgs(["a.csv", "--seats", "1"]),
    "--seats can only be used with --plan business or --plan enterprise.",
  );
});

Deno.test("numeric and plan arguments are validated", () => {
  assertEquals(parsePositiveInteger("100", "--seats"), 100);
  assertEquals(parsePlan("pro-plus"), "pro-plus");
  assertEquals(parsePlan("Business"), "business");

  assertThrows(() => parsePositiveInteger("0", "--seats"), "--seats must be a positive integer.");
  assertThrows(() => parsePositiveInteger("1.5", "--seats"), "--seats must be a positive integer.");
  assertThrows(() => parsePositiveInteger("1e3", "--seats"), "--seats must be a positive integer.");
  assertThrows(() => parsePlan("free"), "Unknown plan: free.");
});

Deno.test("formatText and toJson render summaries", () => {
  const summary = summarize("aic_quantity,aic_gross_amount\n1000,$10.00\n250,2.50\n");
  const comparison = compareWithPlan(summary.totals, "pro", 1);
  const text = formatText("usage.csv", summary, comparison);

  assertIncludes(text, "AI Credits used: 1,250");
  assertIncludes(text, "Gross amount: $12.50");
  assertIncludes(text, "Remaining AI Credits: 250");
  assertIncludes(text, "Estimated overage amount: $0.00");

  const json = toJson("usage.csv", summary, comparison) as {
    totals: { aiCredits: number; grossAmount: number };
    plan: { overageCredits: number };
  };
  assertEquals(json.totals.aiCredits, 1250);
  assertEquals(json.totals.grossAmount, 12.5);
  assertEquals(json.plan.overageCredits, 0);
});

// --- helpers -------------------------------------------------------------------------------

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(actual: string, expected: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`Expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`);
  }
}

function assertThrows(fn: () => void, expectedMessage: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(`Expected error containing ${expectedMessage}, got ${message}`);
    }
    return;
  }

  throw new Error(`Expected error containing ${expectedMessage}`);
}
