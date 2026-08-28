#!/usr/bin/env python3
"""Wave 0/1 gate: verify every workstream's output matches docs/architecture.md.

The contract is the authority. Run from anywhere; exit code 1 if any produced
artefact contradicts it.

Two kinds of check, and the second exists because the first was not enough:

  NAMES       does the identifier the contract froze appear where it should?
  STRUCTURE   do the SHAPES agree — same fields, same order, same nesting?

The name checks once reported 36/36 green while `check_in_ticket` returned a
flat `check_in_result` composite and the TypeScript that parsed it expected a
nested `{ registration: { ... } }`. Both sides spelled `registration_id`,
`event_id` and `ticket_code` identically; they simply disagreed about how many
objects those identifiers were spread across. No amount of grepping for names
can see that, so the structural section below compares field SETS and ORDER
between the SQL composite, the contract's own tuple, and the Zod schema that
parses it — and asserts the schema is flat.
"""
import glob, re, sys, io, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    try:
        return io.open(os.path.join(ROOT, p), encoding="utf-8").read()
    except FileNotFoundError:
        return None


_NOT_SOURCE = {"node_modules", ".next", ".expo", "dist", "build", "coverage", ".turbo"}


def _sources(pattern):
    """Project files matching a glob — never installed or generated ones.

    `apps/admin/**/route.*` otherwise matches a few hundred files in Next.js and,
    worse, the compiled copies of the real handlers under `.next/`, which would
    make the route check pass on build output after the sources were deleted."""
    return sorted(f for f in glob.glob(os.path.join(ROOT, pattern), recursive=True)
                  if not (_NOT_SOURCE & set(f.split(os.sep))))


def read_glob(pattern):
    files = _sources(pattern)
    return "\n".join(io.open(f, encoding="utf-8").read() for f in files), files


contract = read("docs/architecture.md")
if contract is None:
    sys.exit("docs/architecture.md missing — nothing to check against")

# --- parse the contract -------------------------------------------------
# §3 only. Later sections contain tables of the same markdown shape (the §13
# HTTP route table, for one), and scooping those up invents an "enum" called
# POST whose "values" are whatever was backticked in the Purpose column.
_enum_section = re.search(r"^## 3\. Enums\b(.*?)^## 4\.", contract, re.S | re.M)
enums = {}
for line in (_enum_section.group(1) if _enum_section else "").splitlines():
    m = re.match(r"^\|\s*`(\w+)`\s*\|\s*(.+?)\s*\|$", line)
    if m and "`" in m.group(2):
        vals = re.findall(r"`(\w+)`", m.group(2))
        if vals:
            enums[m.group(1)] = vals

tables = re.findall(r"^\*\*(\w+)\*\*\s+—", contract, re.M)
functions = ["register_for_event", "check_in_ticket"]
demo_emails = re.findall(r"`([\w.]+@demo\.local)`", contract)

results = []


def check(name, ok, detail=""):
    results.append((name, ok, detail))


def section(title):
    results.append((title, "section", ""))


# =========================================================================
# PART 1 — NAMES
# =========================================================================
section("names — the identifiers the contract froze")

# --- database workstream ------------------------------------------------
mig_files = sorted(glob.glob(os.path.join(ROOT, "supabase/migrations/*.sql")))
mig = "\n".join(io.open(f, encoding="utf-8").read() for f in mig_files)
if not mig_files:
    check("migrations produced", None, "supabase/migrations/*.sql not present yet")
else:
    low = mig.lower()
    for enum, vals in sorted(enums.items()):
        if f"create type {enum}" not in low and f'create type public.{enum}' not in low:
            check(f"enum {enum}", False, "no CREATE TYPE found")
            continue
        missing = [v for v in vals if f"'{v}'" not in mig]
        check(f"enum {enum}", not missing,
              f"missing values: {missing}" if missing else f"{len(vals)} values")
    for t in tables:
        check(f"table {t}", re.search(rf"create table\s+(if not exists\s+)?(public\.)?{t}\b", low) is not None)
    for fn in functions:
        present = re.search(rf"create (or replace )?function\s+(public\.)?{fn}\b", low) is not None
        check(f"function {fn}", present)
        if present:
            body = low.split(fn, 1)[1]
            nxt = body.find("create function")
            body = body[: nxt if nxt > 0 else len(body)]
            check(f"  {fn} is SECURITY DEFINER", "security definer" in body)
            if fn == "register_for_event":
                check("  register_for_event locks the event row",
                      "for update" in body,
                      "SELECT ... FOR UPDATE is what makes capacity safe")

# --- seed workstream ----------------------------------------------------
seed = read("supabase/seed.sql")
if seed is None:
    check("seed produced", None, "supabase/seed.sql not present yet")
else:
    for e in demo_emails:
        check(f"seed identity {e}", e in seed)
    check("seed has no obvious placeholder names",
          not re.search(r"\b(test event|lorem ipsum|user a\b|foo bar)\b", seed, re.I))

# --- typescript workstreams --------------------------------------------
for pkg, ident in [("packages/domain", "@csa/domain"),
                   ("packages/validation", "@csa/validation"),
                   ("packages/design-tokens", "@csa/design-tokens")]:
    pj = read(f"{pkg}/package.json")
    if pj is None:
        check(f"{pkg} produced", None, "not present yet")
    else:
        check(f"{pkg} named {ident}", f'"{ident}"' in pj)

# enum values must also exist in the TS layer, or the runtimes disagree
dom = "\n".join(io.open(f, encoding="utf-8").read()
                for f in glob.glob(os.path.join(ROOT, "packages/domain/src/**/*.ts"), recursive=True))
if dom:
    for enum, vals in sorted(enums.items()):
        missing = [v for v in vals if f"'{v}'" not in dom and f'"{v}"' not in dom]
        check(f"domain mirrors {enum}", not missing,
              f"missing: {missing}" if missing else "")


# =========================================================================
# PART 2 — STRUCTURE
# =========================================================================

def _balanced(src, open_idx, op="(", cl=")"):
    """Contents between a bracket at open_idx and its match."""
    depth = 0
    for i in range(open_idx, len(src)):
        if src[i] == op:
            depth += 1
        elif src[i] == cl:
            depth -= 1
            if depth == 0:
                return src[open_idx + 1:i]
    return None


def _split_top(body):
    """Split on commas that are not inside brackets."""
    out, depth, cur = [], 0, ""
    for ch in body:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur)
    return [x.strip() for x in out if x.strip()]


def _first_word(s):
    parts = re.split(r"\s+", s.strip(), maxsplit=1)
    return parts[0].strip('"').lower() if parts else ""


def sql_open(pattern):
    """Find `pattern` in the migrations and return the body of the ( ) after it."""
    m = re.search(pattern, mig, re.I)
    if not m:
        return None
    try:
        idx = mig.index("(", m.end() - 1)
    except ValueError:
        return None
    body = _balanced(mig, idx)
    return None if body is None else re.sub(r"--[^\n]*", "", body)


def sql_composite_fields(name):
    body = sql_open(rf"create\s+type\s+(?:public\.)?{name}\s+as\s*\(")
    return None if body is None else [_first_word(p) for p in _split_top(body)]


_NOT_A_COLUMN = {"constraint", "primary", "unique", "check", "foreign",
                 "exclude", "like", "references", "not", "deferrable"}


def sql_altered_columns(table):
    """Columns a later migration adds with ALTER TABLE ... ADD COLUMN.

    Wave M's provenance columns arrive this way, and a gate that reads only
    CREATE TABLE would call the contract wrong about a schema that is right.
    Only the static spelling is understood: a loop over `format()` is invisible
    here, which is why the provenance migration is spelled out per table.
    """
    cols = []
    pat = rf"alter\s+table\s+(?:only\s+)?(?:public\.)?{table}\b(.*?);"
    for m in re.finditer(pat, mig, re.S | re.I):
        for a in re.finditer(r"add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)",
                             m.group(1), re.I):
            cols.append(a.group(1).lower())
    return cols


def sql_table_columns(table):
    body = sql_open(rf"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?{table}\s*\(")
    if body is None:
        return None
    cols = []
    for part in _split_top(body):
        w = _first_word(part)
        if w and w not in _NOT_A_COLUMN and re.fullmatch(r"[a-z_][a-z0-9_]*", w):
            cols.append(w)
    for c in sql_altered_columns(table):
        if c not in cols:
            cols.append(c)
    return cols


def sql_function_params(fn):
    body = sql_open(rf"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?{fn}\s*\(")
    return None if body is None else [_first_word(p) for p in _split_top(body)]


def sql_function_returns(fn):
    m = re.search(rf"create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?{fn}\s*\(", mig, re.I)
    if not m:
        return None
    tail = mig[mig.index("(", m.end() - 1):]
    r = re.search(r"\)\s*returns\s+((?:setof\s+)?[\w.]+)", tail, re.I | re.S)
    return r.group(1).lower() if r else None


def sql_enum_values(name):
    body = sql_open(rf"create\s+type\s+(?:public\.)?{name}\s+as\s+enum\s*\(")
    if body is None:
        return None
    return [v.strip().strip("'") for v in _split_top(body)]


def contract_table_columns(table):
    """The column list from a §4 `**table** — ...` block."""
    m = re.search(rf"^\*\*{table}\*\*\s+—(.*?)(?:\n[ \t]*\n)", contract, re.S | re.M)
    if not m:
        return None
    block = m.group(1)
    cut = block.find("`.")                       # the list ends at its full stop
    if cut != -1:
        block = block[:cut + 1]
    block = re.sub(r"\([^()]*\)", "", block)     # drop parentheticals: (`mock`), (unique, citext)
    cols = []
    for tok in re.findall(r"`([^`]+)`", block):
        w = tok.strip().split()[0] if tok.strip() else ""
        if re.fullmatch(r"[a-z_][a-z0-9_]*", w):
            cols.append(w)
    return cols


def _zod_body(src, symbol):
    """Source text of the object literal bound to `symbol = z.object({ ... })`."""
    m = re.search(rf"\b{re.escape(symbol)}\s*(?::[^=\n]+)?=\s*z\s*\.\s*object\s*\(\s*\{{", src)
    if not m:
        return None
    return _balanced(src, src.index("{", m.end() - 1), "{", "}")


def zod_object_keys(src, symbol):
    """Top-level keys of a z.object literal, in declaration order.

    A character scanner rather than a regex: values contain braces, parentheses,
    strings and comments, and a regex that ignores them silently reports keys
    from nested objects as if they were top-level — which is precisely the
    confusion this file exists to catch.
    """
    body = _zod_body(src, symbol)
    if body is None:
        return None
    keys, depth, token, mode, quote, i, n = [], 0, "", None, None, 0, len(body)
    while i < n:
        ch = body[i]
        if mode == "line":
            if ch == "\n":
                mode = None
        elif mode == "block":
            if body.startswith("*/", i):
                mode = None
                i += 2
                continue
        elif mode == "str":
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                mode = None
        elif body.startswith("//", i):
            mode = "line"
            i += 2
            continue
        elif body.startswith("/*", i):
            mode = "block"
            i += 2
            continue
        elif ch in "\"'`":
            mode, quote = "str", ch
        elif ch in "{[(":
            depth += 1
        elif ch in "}])":
            depth -= 1
        elif depth == 0:
            if re.match(r"[A-Za-z0-9_$]", ch):
                token += ch
            elif ch == ":":
                if token:
                    keys.append(token)
                token = ""
            elif ch not in " \t\r\n":
                token = ""
        i += 1
    return keys


def cmp_fields(label, expected, actual, expected_from, actual_from, ordered=True):
    """Set equality, then order. Two checks so the diagnosis says which broke."""
    missing = [f for f in expected if f not in actual]
    extra = [f for f in actual if f not in expected]
    detail = []
    if missing:
        detail.append(f"{actual_from} is missing {missing}")
    if extra:
        detail.append(f"{actual_from} has {extra} which {expected_from} does not")
    check(label, not missing and not extra,
          "; ".join(detail) or f"{len(expected)} fields")
    if ordered and not missing and not extra and expected != actual:
        check(f"{label}, in order", False,
              f"{expected_from} {expected} vs {actual_from} {actual}")


section("structure — the shapes, not just the names")

rows_src = read("packages/validation/src/rows.ts")
rpc_src = read("packages/validation/src/rpc.ts")

# --- 1. the check_in_result composite -----------------------------------
# This is the divergence the name checks could not see. Three independent
# statements of one shape: the contract's tuple, the SQL composite type, and
# the Zod schema that parses what the function returns.
m = re.search(r"`\(\s*(outcome[^`]*?)\)`", contract, re.S)
contract_result = [x.strip() for x in m.group(1).replace("\n", " ").split(",")] if m else None
sql_result = sql_composite_fields("check_in_result") if mig_files else None

if contract_result is None:
    check("contract declares the check_in_result tuple", False,
          "§5 no longer spells out (outcome, registration_id, ...)")
elif sql_result is None:
    check("SQL type check_in_result", None if not mig_files else False,
          "no CREATE TYPE public.check_in_result found")
else:
    cmp_fields("check_in_result: contract §5 == SQL composite",
               contract_result, sql_result, "contract §5", "SQL composite")

if sql_result and rpc_src is not None:
    ts_result = zod_object_keys(rpc_src, "checkInTicketResultRowSchema")
    if ts_result is None:
        check("check_in_result: SQL composite == validation schema", False,
              "no checkInTicketResultRowSchema = z.object({...}) in packages/validation/src/rpc.ts — "
              "the schema that parses check_in_ticket must be a flat object of the composite's fields")
    else:
        cmp_fields("check_in_result: SQL composite == validation schema",
                   sql_result, ts_result, "SQL composite", "checkInTicketResultRowSchema")
        # The shape check proper. A nested `registration: z.object({...})` keeps
        # every identifier the contract uses and is still wrong: the database
        # returns seven scalars, not an object containing an object.
        body = _zod_body(rpc_src, "checkInTicketResultRowSchema") or ""
        nested = re.findall(r"(\w+)\s*:\s*z\s*\.\s*object\s*\(", body)
        check("check_in_result: validation schema is flat", not nested,
              f"nested object(s) {nested} — check_in_ticket returns a flat composite (contract §5)"
              if nested else "no nested z.object()")
elif rpc_src is None:
    check("check_in_result: SQL composite == validation schema", None,
          "packages/validation/src/rpc.ts not present yet")

# --- 2. the returns clauses ---------------------------------------------
if mig_files:
    for fn, want in [("register_for_event", "public.registrations"),
                     ("check_in_ticket", "public.check_in_result")]:
        got = sql_function_returns(fn)
        check(f"{fn} returns {want}", got is not None and got.replace("setof ", "") == want,
              f"returns {got}" if got != want else "")

# --- 3. RPC argument shapes ---------------------------------------------
# camelCase input -> p_-prefixed args is a hand-written mapping, so it is
# exactly the kind of thing that drifts by one renamed parameter.
if mig_files and rpc_src is not None:
    for fn, schema in [("register_for_event", "registerForEventArgsSchema"),
                       ("check_in_ticket", "checkInTicketArgsSchema")]:
        params = sql_function_params(fn)
        args = zod_object_keys(rpc_src, schema)
        if params is None or args is None:
            check(f"{fn} args == {schema}", False,
                  "could not read " + ("the SQL signature" if params is None else schema))
        else:
            cmp_fields(f"{fn} args == {schema}", params, args, "SQL signature", schema)
elif rpc_src is None:
    check("RPC argument shapes", None, "packages/validation/src/rpc.ts not present yet")

# --- 4. table shapes: contract §4 vs SQL vs the row schemas --------------
ROW_SCHEMAS = {
    "users": "userRowSchema",
    "membership_periods": "membershipPeriodRowSchema",
    "events": "eventRowSchema",
    "registrations": "registrationRowSchema",
    "payments": "paymentRowSchema",
    "scan_attempts": "scanAttemptRowSchema",
    "partners": "partnerRowSchema",
    "audit_events": "auditEventRowSchema",
    "analytics_events": "analyticsEventRowSchema",
}

for table in tables:
    if not mig_files:
        break
    declared = contract_table_columns(table)
    actual = sql_table_columns(table)
    if actual is None:
        check(f"{table}: columns", False, "no CREATE TABLE found")
        continue
    if declared:
        # One direction only. A column the contract names but the table lacks is
        # a divergence; a column the table adds (partners.created_at) is an
        # implementation detail the contract chose not to enumerate.
        missing = [c for c in declared if c not in actual]
        extra = [c for c in actual if c not in declared]
        check(f"{table}: contract §4 columns exist", not missing,
              f"table has no {missing}" if missing
              else (f"{len(declared)} declared, plus {extra} not in §4" if extra else f"{len(declared)} columns"))

    if rows_src is None:
        continue
    schema = ROW_SCHEMAS.get(table)
    if schema is None:
        continue
    keys = zod_object_keys(rows_src, schema)
    if keys is None:
        check(f"{table}: {schema} exists", False, f"no {schema} in packages/validation/src/rows.ts")
        continue
    # Zod strips unknown keys, so a column the schema ignores is harmless. A key
    # the schema requires and the table does not have fails at runtime on the
    # first read, which is why only this direction is a failure.
    unknown = [k for k in keys if k not in actual]
    check(f"{table}: {schema} fields are real columns", not unknown,
          f"{schema} parses {unknown}, which {table} does not have" if unknown
          else f"{len(keys)} of {len(actual)} columns parsed")

if rows_src is None:
    check("row schemas match table shapes", None, "packages/validation/src/rows.ts not present yet")

# --- 5. enums, strictly ---------------------------------------------------
# The name check above searches the whole migration blob for 'value', which a
# comment or an unrelated CHECK constraint can satisfy. This reads the actual
# CREATE TYPE body and demands the same values, in the same order.
if mig_files:
    for enum, vals in sorted(enums.items()):
        got = sql_enum_values(enum)
        if got is None:
            check(f"enum {enum}: values in CREATE TYPE", False, "no CREATE TYPE ... AS ENUM found")
        else:
            cmp_fields(f"enum {enum}: contract §3 == CREATE TYPE", vals, got, "contract §3", enum)

# --- 6. Wave 1 surfaces ---------------------------------------------------
section("wave 1 surfaces")

api_src, api_files = read_glob("packages/api-client/src/**/*.ts")
api_surface = re.findall(r"^\s*(\w+)\s*[(<:]", re.search(
    r"## 12\..*?```ts(.*?)```", contract, re.S).group(1), re.M) if "## 12." in contract else []
api_surface = [f for f in dict.fromkeys(api_surface) if f not in ("ts",)]
if not api_files:
    check("packages/api-client implements the §12 surface", None,
          f"no sources yet — {len(api_surface)} functions expected")
else:
    missing = [f for f in api_surface
               if not re.search(rf"\b(export\s+(async\s+)?function|export\s+const)\s+{f}\b", api_src)]
    check("packages/api-client implements the §12 surface",
          True if not missing else None,
          f"not exported yet: {missing}" if missing else f"{len(api_surface)} functions")

routes = re.findall(r"^\|\s*`(GET|POST|DELETE|PUT|PATCH)`\s*\|\s*`(/api/[^`]+)`", contract, re.M)
route_files = _sources("apps/admin/**/route.*")
if not route_files:
    check("apps/admin serves the §13 HTTP API", None,
          f"no app-router route handlers yet — {len(routes)} routes expected")
else:
    # Path AND verb. A route.ts that exists but exports only GET does not serve
    # `POST /api/session`, and the Expo app would find that out at run time.
    served = {}
    for f in route_files:
        rel = os.path.dirname(f).replace(os.sep, "/")
        idx = rel.rfind("/api/")
        if idx == -1:
            continue
        path = re.sub(r"\[(\.\.\.)?(\w+)\]", r":\2", rel[idx:])
        verbs = set(re.findall(r"export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|DELETE|PUT|PATCH)\b",
                               io.open(f, encoding="utf-8").read()))
        served.setdefault(path, set()).update(verbs)

    missing = [f"{m} {p}" for m, p in routes if m not in served.get(p, set())]
    contracted = {p for _, p in routes}
    undeclared = sorted(p for p in served if p not in contracted)

    # Incomplete is not the same as wrong. A route the contract lists and the app
    # has not built yet is a workstream still in flight (PENDING); a route the app
    # serves that the contract never froze is a divergence (FAIL), because §13 is
    # the exact surface the Expo app is allowed to depend on.
    if undeclared:
        check("apps/admin serves only the §13 HTTP API", False,
              f"not in the contract: {undeclared}")
    else:
        check("apps/admin serves only the §13 HTTP API", True, f"{len(served)} paths")

    if missing:
        check("apps/admin serves the §13 HTTP API", None, f"not served yet: {missing}")
    else:
        check("apps/admin serves the §13 HTTP API", True,
              f"{len(routes)} method+path pairs")

# --- report -------------------------------------------------------------
fail = pend = 0
for name, ok, detail in results:
    if ok == "section":
        print(f"\n--- {name} " + "-" * max(0, 62 - len(name)))
        continue
    if ok is None:
        mark, pend = "PENDING", pend + 1
    elif ok:
        mark = "  ok   "
    else:
        mark, fail = " FAIL  ", fail + 1
    print(f"[{mark}] {name}" + (f" — {detail}" if detail else ""))

total = len([r for r in results if r[1] != "section"])
print(f"\n{total - fail - pend} passed, {fail} failed, {pend} pending")
sys.exit(1 if fail else 0)
