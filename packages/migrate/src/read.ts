/**
 * Reading an extract back.
 *
 * Read-only, always: nothing here writes to, or asks anything of, a source
 * system. The input is a directory of files and a manifest, and the manifest's
 * hashes are verified before a single row is transformed — an extract whose
 * bytes have changed since it was measured cannot support the count it was
 * measured with.
 *
 * The WXR reader handles the subset WordPress actually emits for posts and
 * postmeta, with CDATA. It is not a general XML parser and must not be
 * described as one; the first production change here is swapping it for a real
 * one, because a hand-rolled scanner meets its first malformed export badly.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  FormResponse,
  LedgerEntry,
  MolliePayment,
  MongoMember,
  MongoMembership,
  WpItem,
} from "@csa/legacy-fixtures";

/** Money measured at extract time, keyed by the source's own status vocabulary. */
export type ManifestAmounts = Readonly<
  Record<string, Readonly<Record<string, { readonly rows: number; readonly cents: number }>>>
>;

export interface ManifestFileEntry {
  readonly path: string;
  readonly sourceSystem: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly schemaVersion: string;
  /** `{ entity: { year: count } }`, taken before anything transformed a row. */
  readonly counts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** Present only for a source that carries money. */
  readonly amounts?: ManifestAmounts;
}

export interface ExtractManifest {
  readonly extractId: string;
  readonly extractedAt: string;
  readonly files: readonly ManifestFileEntry[];
  readonly notExtracted?: readonly string[];
}

export class ExtractIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractIntegrityError";
  }
}

export function readManifest(root: string): ExtractManifest {
  const raw = readFileSync(join(root, "manifest.json"), "utf8");
  const manifest = JSON.parse(raw) as ExtractManifest;
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new ExtractIntegrityError("manifest lists no files");
  }
  return manifest;
}

/**
 * Verifies each file against the hash recorded at extract time.
 *
 * This is not ceremony. The manifest's counts are the source side of every
 * later comparison; if the bytes moved after they were counted, the comparison
 * is against a number that describes a different file.
 */
export function verifyExtract(root: string, manifest: ExtractManifest): void {
  for (const entry of manifest.files) {
    const contents = readFileSync(join(root, entry.path), "utf8");
    const actual = createHash("sha256").update(contents, "utf8").digest("hex");
    if (actual !== entry.sha256) {
      throw new ExtractIntegrityError(
        `${entry.path} does not match the manifest: expected ${entry.sha256}, found ${actual}`,
      );
    }
  }
}

export function readJsonl<T>(root: string, path: string): T[] {
  return readFileSync(join(root, path), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as T);
}

/** RFC 4180, including the doubled quote inside a quoted field. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name] = row[i] ?? "";
    });
    return record;
  });
}

export function readCsv(root: string, path: string): Array<Record<string, string>> {
  return csvRecords(readFileSync(join(root, path), "utf8"));
}

function cdataOrText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*)]]>\s*$/.exec(raw);
  const value = cdata?.[1] ?? raw;
  return value
    .replace(/]]]]><!\[CDATA\[>/g, "]]>")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .trim();
}

function tag(item: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(item);
  return m ? cdataOrText(m[1] as string) : undefined;
}

/** Parses the WXR subset the fixture emits and WordPress produces. */
export function readWxr(root: string, path: string): WpItem[] {
  const xml = readFileSync(join(root, path), "utf8");
  const items: WpItem[] = [];

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = match[1] as string;
    const postmeta: Record<string, string> = {};
    for (const meta of body.matchAll(/<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g)) {
      const block = meta[1] as string;
      const key = tag(block, "wp:meta_key");
      const value = tag(block, "wp:meta_value");
      if (key !== undefined) postmeta[key] = value ?? "";
    }

    const postType = tag(body, "wp:post_type");
    items.push({
      postId: Number(tag(body, "wp:post_id") ?? "0"),
      postType: (postType === "page" || postType === "post"
        ? postType
        : "csa_event") as WpItem["postType"],
      title: tag(body, "title") ?? "",
      slug: tag(body, "wp:post_name") ?? "",
      link: tag(body, "link") ?? "",
      pubDate: tag(body, "pubDate") ?? "",
      status: (tag(body, "wp:status") === "draft" ? "draft" : "publish") as WpItem["status"],
      content: tag(body, "content:encoded") ?? "",
      postmeta,
    });
  }
  return items;
}

export interface LoadedExtract {
  readonly manifest: ExtractManifest;
  /** Committee applications. Read so they can be accounted for, not imported. */
  readonly actives: readonly FormResponse[];
  readonly members: readonly MongoMember[];
  readonly memberships: readonly MongoMembership[];
  readonly wordpress: readonly WpItem[];
  readonly eventSignups: readonly FormResponse[];
  readonly payments: readonly MolliePayment[];
  readonly ledger: readonly LedgerEntry[];
}

/** Reads and verifies the whole extract. Throws before transforming anything. */
export function loadExtract(root: string): LoadedExtract {
  const manifest = readManifest(root);
  verifyExtract(root, manifest);

  const signups = readCsv(root, "google_forms/event-signups.csv").map((r): FormResponse => ({
    rowId: r["Row ID"] ?? "",
    timestamp: r["Timestamp"] ?? "",
    emailAddress: r["Email Address"] ?? "",
    fullName: r["Full name"] ?? "",
    whichEvent: r["Which event?"] ?? "",
    memberAnswer: r["Are you a member?"] ?? "",
  }));

  const actives = readCsv(root, "google_forms/actives-recruitment.csv").map((r): FormResponse => ({
    rowId: r["Row ID"] ?? "",
    timestamp: r["Timestamp"] ?? "",
    emailAddress: r["Email Address"] ?? "",
    fullName: r["Full name"] ?? "",
    whichEvent: r["Which event?"] ?? "",
    memberAnswer: r["Are you a member?"] ?? "",
  }));

  const payments = readCsv(root, "mollie/payments.csv").map((r): MolliePayment => ({
    id: r["id"] ?? "",
    status: r["status"] ?? "",
    amount: r["amount"] ?? "",
    description: r["description"] ?? "",
    createdAt: r["createdAt"] ?? "",
    method: r["method"] ?? "",
  }));

  const ledger = readCsv(root, "office_ledger/register.csv").map((r): LedgerEntry => ({
    rowId: r["row_id"] ?? "",
    date: r["datum"] ?? "",
    name: r["naam"] ?? "",
    email: r["email"] ?? "",
    amount: r["bedrag"] ?? "",
    handledBy: r["afgehandeld_door"] ?? "",
    notes: r["opmerkingen"] ?? "",
  }));

  return {
    manifest,
    members: readJsonl<MongoMember>(root, "mongodb/members.jsonl"),
    memberships: readJsonl<MongoMembership>(root, "mongodb/memberships.jsonl"),
    wordpress: readWxr(root, "wordpress/csa-rotterdam.wordpress.xml"),
    actives,
    eventSignups: signups,
    payments,
    ledger,
  };
}
