#!/usr/bin/env python3
"""Dump an OpenCode session's tool-call trace from the local database.

Extracts the same view a /retro retrospective needs: per user message,
and per tool call (name, status, elapsed ms, output size, input preview).

Usage:
    python3 scripts/session-trace.py [session-id]
    python3 scripts/session-trace.py --json [session-id]
    python3 scripts/session-trace.py --limit 20

Session id defaults to $OPENCODE_SESSION_ID (the current session).
Database: ~/.local/share/opencode/opencode.db (tables session_message with
parts embedded in data.content; falls back to the older message+part split).
Stdlib only.
"""

import argparse
import json
import os
import sqlite3
import sys

DB_PATH = os.path.expanduser("~/.local/share/opencode/opencode.db")


def connect() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        sys.exit(f"error: no session database at {DB_PATH}")
    try:
        con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    except sqlite3.Error as e:
        sys.exit(f"error: cannot open {DB_PATH}: {e}")
    return con


def tool_part_info(p: dict) -> dict | None:
    if not isinstance(p, dict) or p.get("type") != "tool":
        return None
    st = p.get("state") or {}
    tim = p.get("time") or {}
    elapsed = None
    if tim.get("ran") and tim.get("completed"):
        elapsed = tim["completed"] - tim["ran"]
    out = 0
    for x in st.get("content") or []:
        if isinstance(x, dict):
            out += len(str(x.get("text", "")))
    inp = st.get("input")
    return {
        "tool": p.get("name"),
        "status": st.get("status"),
        "elapsed_ms": elapsed,
        "output_len": out,
        "input": json.dumps(inp)[:120] if inp else "",
        "error": st.get("error"),
    }


def load_v2(cur: sqlite3.Cursor, sid: str) -> list[dict]:
    """Current schema: session_message with parts embedded in data.content."""
    rows = cur.execute(
        "SELECT seq, type, data FROM session_message WHERE session_id=? ORDER BY seq",
        (sid,),
    ).fetchall()
    if not rows:
        return []
    out = []
    for _seq, typ, data in rows:
        try:
            d = json.loads(data)
        except json.JSONDecodeError:
            continue
        if typ == "user":
            out.append({"kind": "user", "text": d.get("text", "")})
            continue
        for p in d.get("content") or []:
            info = tool_part_info(p)
            if info:
                out.append({"kind": "tool", **info})
    return out


def load_legacy(cur: sqlite3.Cursor, sid: str) -> list[dict]:
    """Older schema: message + part tables."""
    if "part" not in {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}:
        return []
    try:
        rows = cur.execute(
            "SELECT data, time_created FROM part WHERE session_id=? ORDER BY time_created",
            (sid,),
        ).fetchall()
    except sqlite3.Error:
        return []
    out = []
    for data, _tc in rows:
        try:
            p = json.loads(data)
        except json.JSONDecodeError:
            continue
        info = tool_part_info(p)
        if info:
            out.append({"kind": "tool", **info})
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("session_id", nargs="?", default=os.environ.get("OPENCODE_SESSION_ID"))
    ap.add_argument("--json", action="store_true", help="emit raw JSON")
    ap.add_argument("--limit", type=int, default=0, help="only first N entries")
    args = ap.parse_args()

    if not args.session_id:
        sys.exit("error: no session id given and $OPENCODE_SESSION_ID is unset")

    con = connect()
    cur = con.cursor()
    entries = load_v2(cur, args.session_id) or load_legacy(cur, args.session_id)
    if not entries:
        sys.exit(f"error: no messages found for session {args.session_id}")

    if args.limit:
        entries = entries[: args.limit]

    if args.json:
        print(json.dumps({"session": args.session_id, "entries": entries}, indent=2))
        return 0

    print(f"session {args.session_id}")
    for e in entries:
        if e["kind"] == "user":
            print("USER:", (e.get("text") or "").replace("\n", " | ")[:150])
            continue
        el = f"{e['elapsed_ms']}ms" if e["elapsed_ms"] is not None else "?"
        err = f" ERR: {json.dumps(e['error'])[:150]}" if e.get("error") else ""
        print(
            f"  TOOL {e['tool']} [{e['status']}] {el} out~{e['output_len']} "
            f"{e['input']}{err}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())