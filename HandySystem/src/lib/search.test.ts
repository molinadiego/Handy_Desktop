import { describe, expect, it } from "vitest";
import { filterSearchOptions, type SearchOption } from "./search";

const records: SearchOption[] = [
  { value: "client-1", label: "María Gómez", detail: "Property manager · 555-0101" },
  { value: "client-2", label: "Carlos Ruiz", detail: "Direct client · 555-0102" },
  { value: "property-1", label: "42 Oak Street", detail: "Austin, Texas" },
];

describe("searchable picker filtering", () => {
  it("filters by a partial name or address as the user types", () => {
    expect(filterSearchOptions(records, "Oak").map(({ value }) => value)).toEqual(["property-1"]);
    expect(filterSearchOptions(records, "Carlos").map(({ value }) => value)).toEqual(["client-2"]);
  });

  it("matches accents without requiring them in the query", () => {
    expect(filterSearchOptions(records, "Maria").map(({ value }) => value)).toEqual(["client-1"]);
  });

  it("returns every option for an empty query", () => {
    expect(filterSearchOptions(records, "")).toEqual(records);
  });
});
