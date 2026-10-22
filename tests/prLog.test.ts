import { describe, expect, it } from "vitest";
import { cleanTitle, parseGitLog } from "@/lib/pr-log";

const rec = (date: string, subject: string, body = "") => `${date}\x1f${subject}\x1f${body}\x1e`;

describe("parseGitLog", () => {
  it("lit les merge commits et les squash, ignore le reste", () => {
    const raw =
      rec("2026-10-22", "Merge pull request #72 from SuperNon0/x", "feat: suppression des photos\n\ndétails") +
      rec("2026-10-21", "chore: commit direct") +
      rec("2026-10-20", "fix(pdf) : aperçu réparé (#71)");
    expect(parseGitLog(raw)).toEqual([
      { number: 72, date: "2026-10-22", title: "Suppression des photos" },
      { number: 71, date: "2026-10-20", title: "Aperçu réparé" },
    ]);
  });

  it("respecte la limite", () => {
    const raw = rec("2026-10-22", "Merge pull request #2 from a", "b") + rec("2026-10-21", "Merge pull request #1 from a", "a");
    expect(parseGitLog(raw, 1)).toHaveLength(1);
  });
});

describe("cleanTitle", () => {
  it("retire le préfixe de type", () => {
    expect(cleanTitle("V2.0 : nouveau design")).toBe("V2.0 : nouveau design");
    expect(cleanTitle("docs(changelog): entrée V2.1")).toBe("Entrée V2.1");
  });
});
