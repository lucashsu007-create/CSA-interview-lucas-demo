import { describe, expect, it } from "vitest";

import { normaliseEmail, normalisePhone, parseLegacyDate, parseMoneyToCents } from "./normalise";
import { RULES } from "./rules";

describe("normaliseEmail", () => {
  it("unwraps the shapes a legacy record actually stores", () => {
    for (const raw of [
      "wen.veldkamp@demo.local",
      "  wen.veldkamp@demo.local ",
      "WEN.VELDKAMP@DEMO.LOCAL",
      "Wen Veldkamp <wen.veldkamp@demo.local>",
      "wen.veldkamp @ demo.local",
    ]) {
      const out = normaliseEmail(raw);
      expect(out.ok, raw).toBe(true);
      if (out.ok) expect(out.value).toBe("wen.veldkamp@demo.local");
    }
  });

  it("records the rule it applied", () => {
    const out = normaliseEmail(" A@B.local ");
    expect(out.ok && out.rules).toEqual([RULES.EMAIL_NORMALISED]);
  });

  it("refuses rather than repairing", () => {
    // A domain that looks like a typo is left alone; there is no rule here that
    // would "correct" it, and inventing one is how a migration mails a stranger.
    for (const raw of ["", "   ", "not-an-address", "two@@ats.local", "a@b", "a@.local"]) {
      const out = normaliseEmail(raw);
      expect(out.ok, raw).toBe(false);
      if (!out.ok) expect(out.reason).toBe("missing_required_field");
    }
  });
});

describe("parseLegacyDate", () => {
  it("reads both formats in the estate", () => {
    const dutch = parseLegacyDate("05-03-2019");
    expect(dutch.ok && dutch.value.toISOString()).toBe("2019-03-05T00:00:00.000Z");
    expect(dutch.ok && dutch.rules).toEqual([RULES.DATE_DUTCH_PARSED]);

    const iso = parseLegacyDate("2024-11-30T00:00:00Z");
    expect(iso.ok && iso.value.toISOString()).toBe("2024-11-30T00:00:00.000Z");
    expect(iso.ok && iso.rules).toEqual([RULES.DATE_ISO_PARSED]);
  });

  it("refuses a day that does not exist instead of rolling it forward", () => {
    // `new Date(2024, 1, 31)` is 2 March. A silent roll is the whole failure
    // mode: nothing errors, and a membership starts on the wrong day forever.
    const out = parseLegacyDate("31-02-2024");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("unparseable_date");
      expect(out.detail).toContain("not a date on any calendar");
    }
  });

  it("treats 'onbekend' as unparseable, not as empty", () => {
    const out = parseLegacyDate("onbekend");
    expect(out.ok).toBe(false);
    // Someone typed that they did not know. That is information; it is not a date.
    if (!out.ok) expect(out.reason).toBe("unparseable_date");
  });
});

describe("parseMoneyToCents", () => {
  it("reads every spelling the estate contains", () => {
    for (const [raw, cents] of [
      ["€ 15,00", 1500],
      ["15.00", 1500],
      ["15,00", 1500],
      ["15", 1500],
      ["€ 45,00", 4500],
      ["0", 0],
    ] as const) {
      const out = parseMoneyToCents(raw);
      expect(out.ok, raw).toBe(true);
      if (out.ok) expect(out.value, raw).toBe(cents);
    }
  });

  it("does not lose a cent to binary floating point", () => {
    const out = parseMoneyToCents("15.10");
    expect(out.ok && out.value).toBe(1510);
  });

  it("refuses an amount carrying both separators", () => {
    // 1.234,56 and 1,234.56 are the same digits under two conventions. Picking
    // one is a guess about six figures.
    const out = parseMoneyToCents("1.234,56");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.detail).toContain("ambiguous");
  });
});

describe("normalisePhone", () => {
  it("normalises when the country is certain", () => {
    const international = normalisePhone("+31 6 1234 5678", undefined);
    expect(international.ok && international.value.e164).toBe(true);

    const known = normalisePhone("0612345678", "NL");
    expect(known.ok && known.value.value).toBe("+31612345678");
  });

  it("refuses a national number with no country", () => {
    // `612345678` is a Dutch mobile and a valid subscriber number elsewhere.
    // Prefixing +31 because the association is Dutch is a guess about how to
    // reach a person.
    const out = normalisePhone("612345678", "");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("unresolvable_country");
  });

  it("keeps a number as found when the country is known but the shape is not", () => {
    const out = normalisePhone("0201234567", "BE");
    expect(out.ok && out.value.e164).toBe(false);
    expect(out.ok && out.rules).toEqual([RULES.PHONE_LEFT_UNNORMALISED]);
  });
});
