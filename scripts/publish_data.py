#!/usr/bin/env python3
"""
VJAlgo Dashboard — Data Publisher
==================================
Run this on your trading machine. It reads your SQLite databases
and CSV files, exports JSON files to the website's data/ folder,
and pushes to GitHub automatically.

SETUP (one time):
  pip install gitpython

CONFIGURE:
  Edit the CONFIG section below with your paths.

RUN:
  python publish_data.py              ← runs once and exits
  python publish_data.py --watch      ← runs every 5 minutes continuously
  python publish_data.py --watch --interval 60  ← run every 60 seconds
"""

import sqlite3, json, csv, os, sys, time, argparse, traceback
from datetime import datetime
from pathlib import Path

# ══════════════════════════════════════════════════════════════
#  CONFIG — EDIT THESE PATHS
# ══════════════════════════════════════════════════════════════
CONFIG = {
    # Absolute paths to your database files
    "real_trades_db":     r"D:\SO\data\real_trades.db",
    "scanner_db":         r"D:\SO\data\scanner.db",

    # Absolute paths to your CSV files
    "picks_csv":          r"D:\SO\data\picks.csv",
    "post_exit_csv":      r"D:\SO\data\post_exit_tracker.csv",
    "priority_csv":       r"D:\SO\data\priority_watchlist.csv",

    # Path to your cloned GitHub Pages repo
    # (the folder containing docs/ where index.html lives)
    "repo_path":          r"D:\vjalgodash",

    # GitHub auto-push (set False to just write files without pushing)
    "auto_push":          True,

    # Commit message prefix
    "commit_prefix":      "data: auto-update",
}
# ══════════════════════════════════════════════════════════════

DATA_DIR = Path(CONFIG["repo_path"]) / "docs" / "data"


def connect(db_path):
    if not os.path.exists(db_path):
        print(f"  ⚠  DB not found: {db_path}")
        return None
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def rows_to_dicts(rows):
    return [dict(r) for r in rows]


def safe_float(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


# ── EXPORTERS ────────────────────────────────────────────────

def export_summary():
    """Top-level KPIs"""
    data = {
        "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "real_alltime_pnl": None,
        "today_net_pnl": None,
        "win_rate": None,
        "total_closed_trades": 0,
        "wins": 0,
        "losses": 0,
        "open_positions": 0,
    }
    conn = connect(CONFIG["real_trades_db"])
    if conn:
        r = conn.execute(
            "SELECT COUNT(*) total, SUM(net_pnl) alltime, "
            "SUM(CASE WHEN net_pnl>0 THEN 1 ELSE 0 END) wins, "
            "SUM(CASE WHEN net_pnl<0 THEN 1 ELSE 0 END) losses "
            "FROM real_option_trades WHERE status='CLOSED'"
        ).fetchone()
        data["total_closed_trades"] = r["total"] or 0
        data["real_alltime_pnl"] = safe_float(r["alltime"])
        data["wins"] = r["wins"] or 0
        data["losses"] = r["losses"] or 0
        if data["total_closed_trades"] > 0:
            data["win_rate"] = round(data["wins"] / data["total_closed_trades"] * 100, 1)

        today = datetime.now().strftime("%Y-%m-%d")
        today_r = conn.execute(
            "SELECT net_pnl FROM real_daily_pnl WHERE date=?", (today,)
        ).fetchone()
        data["today_net_pnl"] = safe_float(today_r["net_pnl"]) if today_r else 0

        open_c = conn.execute(
            "SELECT COUNT(*) c FROM real_option_trades WHERE status='OPEN'"
        ).fetchone()
        data["open_positions"] = open_c["c"] or 0
        conn.close()
    return data


def export_daily_pnl():
    conn = connect(CONFIG["real_trades_db"])
    if not conn:
        return []
    rows = conn.execute(
        "SELECT date, trades, wins, losses, net_pnl "
        "FROM real_daily_pnl ORDER BY date DESC LIMIT 30"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        d["net_pnl"] = safe_float(d["net_pnl"])
        out.append(d)
    return out


def export_real_trades():
    conn = connect(CONFIG["real_trades_db"])
    if not conn:
        return []
    rows = conn.execute(
        "SELECT symbol, option_symbol, direction, strategy, "
        "entry_date, entry_time, entry_premium, exit_date, exit_time, "
        "exit_premium, lots, lot_size, exit_reason, pnl, net_pnl, status, "
        "peak_premium, current_premium, current_pnl "
        "FROM real_option_trades ORDER BY entry_date DESC, entry_time DESC"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        for k in ["entry_premium","exit_premium","pnl","net_pnl","peak_premium","current_premium","current_pnl"]:
            d[k] = safe_float(d[k])
        out.append(d)
    return out


def export_open_positions():
    conn = connect(CONFIG["real_trades_db"])
    if not conn:
        return []
    rows = conn.execute(
        "SELECT symbol, option_symbol, direction, strategy, "
        "entry_date, entry_time, entry_premium, current_premium, "
        "current_pnl, peak_premium, status "
        "FROM real_option_trades WHERE status='OPEN'"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        for k in ["entry_premium","current_premium","current_pnl","peak_premium"]:
            d[k] = safe_float(d[k])
        out.append(d)
    return out


def export_signals():
    """Reads picks from CSV (freshest) or scanner.db"""
    picks_path = CONFIG["picks_csv"]
    if os.path.exists(picks_path):
        rows = []
        with open(picks_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                for k in ["score","cmp_at_scan","breakout_level","stop_loss","stop_loss_pct",
                          "t1","t1_pct","t2","t2_pct","t3","t3_pct"]:
                    row[k] = safe_float(row.get(k))
                rows.append(row)
        return rows
    # fallback to DB
    conn = connect(CONFIG["scanner_db"])
    if not conn:
        return []
    rows = conn.execute(
        "SELECT scan_date, symbol, patterns, conviction, cmp_at_scan, "
        "breakout_level, stop_loss, stop_loss_pct, t1, t1_pct, t2, t2_pct, "
        "t3, t3_pct, score, status "
        "FROM picks ORDER BY scan_date DESC, score DESC"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        for k in ["score","cmp_at_scan","breakout_level","stop_loss","t1","t1_pct","t2","t2_pct","t3","t3_pct"]:
            d[k] = safe_float(d[k])
        out.append(d)
    return out


def export_watchlist():
    wl_path = CONFIG["priority_csv"]
    if os.path.exists(wl_path):
        rows = []
        with open(wl_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                for k in ["score","score_a","score_b","score_c","score_d","score_e",
                          "ltp","ret5d","ret10d","gap52w","vol_ratio"]:
                    row[k] = safe_float(row.get(k))
                rows.append(row)
        return sorted(rows, key=lambda x: -(x.get("score") or 0))
    # fallback DB
    conn = connect(CONFIG["scanner_db"])
    if not conn:
        return []
    rows = conn.execute(
        "SELECT symbol, score, score_a, score_b, score_c, score_d, score_e, "
        "ltp, ret5d, ret10d, gap52w, vol_ratio "
        "FROM priority_watchlist ORDER BY score DESC, id DESC LIMIT 100"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        for k in ["score","score_a","score_b","score_c","score_d","score_e","ltp","ret5d","ret10d","gap52w","vol_ratio"]:
            d[k] = safe_float(d[k])
        out.append(d)
    return out


def export_post_exit():
    pe_path = CONFIG["post_exit_csv"]
    if os.path.exists(pe_path):
        rows = []
        with open(pe_path, newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                for k in ["net_pnl_actual","pnl_if_held_close","pnl_if_held_high",
                          "pnl_if_held_low","pnl_delta_vs_actual","pnl_pct_if_held"]:
                    row[k] = safe_float(row.get(k))
                rows.append(row)
        return rows
    conn = connect(CONFIG["real_trades_db"])
    if not conn:
        return []
    rows = conn.execute(
        "SELECT * FROM post_exit_tracker ORDER BY tracking_date DESC"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        for k in ["net_pnl_actual","pnl_if_held_close","pnl_if_held_high",
                  "pnl_if_held_low","pnl_delta_vs_actual","pnl_pct_if_held"]:
            d[k] = safe_float(d[k])
        # add verdict field if missing
        if "verdict" not in d or not d["verdict"]:
            delta = d.get("pnl_delta_vs_actual") or 0
            d["verdict"] = "HELD_BETTER" if delta > 0 else "EXIT_WAS_CORRECT"
        out.append(d)
    return out


def export_strategy_stats():
    conn = connect(CONFIG["real_trades_db"])
    if not conn:
        # try scanner for paper trades
        conn = connect(CONFIG["scanner_db"])
        if not conn:
            return []
        rows = conn.execute("""
            SELECT strategy, direction, COUNT(*) trades,
                   SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) wins,
                   ROUND(SUM(pnl),0) total_pnl
            FROM paper_option_trades WHERE status='CLOSED'
            GROUP BY strategy, direction ORDER BY total_pnl DESC
        """).fetchall()
        conn.close()
    else:
        rows = conn.execute("""
            SELECT strategy, direction, COUNT(*) trades,
                   SUM(CASE WHEN net_pnl>0 THEN 1 ELSE 0 END) wins,
                   ROUND(SUM(net_pnl),0) total_pnl
            FROM real_option_trades WHERE status='CLOSED'
            GROUP BY strategy, direction ORDER BY total_pnl DESC
        """).fetchall()
        conn.close()
    return [dict(r) for r in rows]


def export_paper_stats():
    conn = connect(CONFIG["scanner_db"])
    if not conn:
        return {}
    r = conn.execute(
        "SELECT COUNT(*) total, SUM(pnl) net, "
        "SUM(CASE WHEN pnl>0 THEN 1 ELSE 0 END) wins "
        "FROM paper_option_trades WHERE status='CLOSED'"
    ).fetchone()
    conn.close()
    total = r["total"] or 0
    wins = r["wins"] or 0
    return {
        "total_trades": total,
        "wins": wins,
        "losses": total - wins,
        "win_rate": round(wins/total*100, 1) if total > 0 else None,
        "net_pnl": safe_float(r["net"]),
    }


# ── WRITE JSON ───────────────────────────────────────────────

def write_json(name, data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / f"{name}.json"
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, default=str, ensure_ascii=False, indent=2)
    print(f"  ✓  {name}.json")


# ── GIT PUSH ─────────────────────────────────────────────────

def git_push():
    """Uses system git command directly — no gitpython dependency needed."""
    import subprocess
    try:
        repo = CONFIG["repo_path"]
        ts = datetime.now().strftime("%Y-%m-%d %H:%M")

        # Stage the data folder
        subprocess.run(
            ["git", "-C", repo, "add", "docs/data"],
            check=True, capture_output=True
        )

        # Check if there is anything new to commit
        status = subprocess.run(
            ["git", "-C", repo, "status", "--porcelain"],
            check=True, capture_output=True, text=True
        )

        if status.stdout.strip():
            subprocess.run(
                ["git", "-C", repo, "commit", "-m",
                 f"{CONFIG['commit_prefix']} {ts}"],
                check=True, capture_output=True
            )
            subprocess.run(
                ["git", "-C", repo, "push"],
                check=True, capture_output=True
            )
            print(f"  ✓  Pushed to GitHub at {ts}")
        else:
            print("  ℹ  No changes to push (data unchanged)")

    except FileNotFoundError:
        print("  ✗  git not found. Please install Git from https://git-scm.com/download/win")
        print("     Then close and reopen this window and run the script again.")
    except subprocess.CalledProcessError as e:
        print(f"  ✗  Git command failed: {e}")
        if e.stderr:
            print("     ", e.stderr.decode(errors="replace").strip())
    except Exception as e:
        print(f"  ✗  Git push failed: {e}")
        traceback.print_exc()


# ── MAIN ─────────────────────────────────────────────────────

def run_once():
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Publishing data…")
    try:
        write_json("summary",        export_summary())
        write_json("daily_pnl",      export_daily_pnl())
        write_json("real_trades",    export_real_trades())
        write_json("open_positions", export_open_positions())
        write_json("signals",        export_signals())
        write_json("watchlist",      export_watchlist())
        write_json("post_exit",      export_post_exit())
        write_json("strategy_stats", export_strategy_stats())
        write_json("paper_stats",    export_paper_stats())

        if CONFIG["auto_push"]:
            git_push()
        print(f"  Done ✓\n")
    except Exception as e:
        print(f"  ✗ Error: {e}")
        traceback.print_exc()


def main():
    parser = argparse.ArgumentParser(description="VJAlgo Dashboard Publisher")
    parser.add_argument("--watch", action="store_true", help="Run continuously")
    parser.add_argument("--interval", type=int, default=300, help="Interval in seconds (default 300 = 5min)")
    args = parser.parse_args()

    run_once()
    if args.watch:
        print(f"Watching… will publish every {args.interval}s. Press Ctrl+C to stop.\n")
        while True:
            time.sleep(args.interval)
            run_once()


if __name__ == "__main__":
    main()
