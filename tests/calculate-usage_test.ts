import {
  calculateTotals,
  parseCsv,
  parsePlan,
  parsePositiveInteger,
} from "../src/calculate-usage.ts";

Deno.test("parseCsv handles BOM, quoted fields, and CRLF", () => {
  const records = parseCsv(
    '\uFEFFaic_quantity,aic_gross_amount,note\r\n1,2.50,"hello, world"\r\n"2","$3.50",ok\r\n',
  );

  assertEquals(records, [
    { aic_quantity: "1", aic_gross_amount: "2.50", note: "hello, world" },
    { aic_quantity: "2", aic_gross_amount: "$3.50", note: "ok" },
  ]);
});

Deno.test("parseCsv ignores empty rows and rejects missing columns", () => {
  assertEquals(
    parseCsv("aic_quantity,aic_gross_amount\n1,2\n\n"),
    [{ aic_quantity: "1", aic_gross_amount: "2" }],
  );

  assertThrows(
    () => parseCsv("aic_quantity\n1\n"),
    "CSV is missing required columns: aic_gross_amount",
  );
});

Deno.test("parseCsv rejects malformed rows and unterminated quotes", () => {
  assertThrows(
    () => parseCsv("aic_quantity,aic_gross_amount\n1,2,3\n"),
    "Row 2 has more columns than the header row.",
  );
  assertThrows(
    () => parseCsv('aic_quantity,aic_gross_amount\n"1,2\n'),
    "CSV contains an unterminated quoted field.",
  );
  assertThrows(
    () => parseCsv('aic_quantity,aic_gross_amount\n"1"x,2\n'),
    "CSV contains characters after a closing quote.",
  );
  assertThrows(
    () => parseCsv('aic_quantity,aic_gross_amount\nab"cd,2\n'),
    "CSV contains a quote inside an unquoted field.",
  );
});

Deno.test("parseCsv rejects empty and duplicate headers", () => {
  assertThrows(
    () => parseCsv("aic_quantity,,aic_gross_amount\n1,2,3\n"),
    "CSV contains an empty header.",
  );
  assertThrows(
    () => parseCsv("aic_quantity,aic_quantity,aic_gross_amount\n1,2,3\n"),
    "CSV contains duplicate headers: aic_quantity",
  );
});

Deno.test("calculateTotals sums valid usage values", () => {
  const totals = calculateTotals(parseCsv("aic_quantity,aic_gross_amount\n1000,$10.00\n250,2.50\n"));

  assertEquals(totals, {
    rows: 2,
    aiCredits: 1250,
    grossAmountUsd: 12.5,
  });
});

Deno.test("numeric and plan arguments are validated", () => {
  assertEquals(parsePositiveInteger("100", "--seats"), 100);
  assertEquals(parsePlan("pro-plus"), "pro-plus");

  assertThrows(() => parsePositiveInteger("0", "--seats"), "--seats must be a positive integer.");
  assertThrows(() => parsePositiveInteger("1.5", "--seats"), "--seats must be a positive integer.");
  assertThrows(() => parsePlan("free"), "Unknown plan: free.");
});

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
