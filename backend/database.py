import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "offline_mate.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                activity_type TEXT NOT NULL,
                title TEXT NOT NULL,
                details TEXT,
                meta_json TEXT,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS task_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                objective TEXT NOT NULL,
                tasks_json TEXT NOT NULL,
                approved INTEGER DEFAULT 0,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()

def log_activity(activity_type: str, title: str, details: str = "", meta: Optional[Dict[str, Any]] = None):
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO activity_logs (activity_type, title, details, meta_json, created_at) VALUES (?, ?, ?, ?, ?)",
            (activity_type, title, details, json.dumps(meta or {}), datetime.now().isoformat())
        )
        conn.commit()

def get_recent_activities(limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        return [
            {
                "id": row["id"],
                "activity_type": row["activity_type"],
                "title": row["title"],
                "details": row["details"],
                "meta": json.loads(row["meta_json"]) if row["meta_json"] else {},
                "created_at": row["created_at"],
            }
            for row in rows
        ]

def clear_all_activities():
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM activity_logs")
        cursor.execute("DELETE FROM task_plans")
        conn.commit()

def save_task_plan(title: str, objective: str, tasks: List[Dict[str, Any]], approved: bool = False) -> int:
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO task_plans (title, objective, tasks_json, approved, created_at) VALUES (?, ?, ?, ?, ?)",
            (title, objective, json.dumps(tasks), 1 if approved else 0, datetime.now().isoformat())
        )
        conn.commit()
        return cursor.lastrowid

def get_task_plans() -> List[Dict[str, Any]]:
    init_db()
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM task_plans ORDER BY id DESC")
        rows = cursor.fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "objective": row["objective"],
                "tasks": json.loads(row["tasks_json"]),
                "approved": bool(row["approved"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
