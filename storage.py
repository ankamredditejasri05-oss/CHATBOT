"""
storage.py – Chat History Persistence Layer
============================================
Manages all reading and writing of conversation data using a JSON file.

Technical Decision:
    JSON file storage was chosen for its zero-dependency simplicity in a
    single-developer intern project. The data is human-readable, easy to
    inspect in any editor, and trivial to back up. Swapping to SQLite or
    MongoDB would only require replacing this module.
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ── File paths ────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).parent / "data"
DB_FILE  = DATA_DIR / "conversations.json"


# ── Internal helpers ──────────────────────────────────────────────────────────

def _ensure_db() -> None:
    """Create the data directory and JSON file if they don't exist yet."""
    DATA_DIR.mkdir(exist_ok=True)
    if not DB_FILE.exists():
        DB_FILE.write_text(json.dumps({"conversations": []}, indent=2), encoding="utf-8")


def _read_db() -> dict:
    _ensure_db()
    try:
        return json.loads(DB_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"conversations": []}


def _write_db(data: dict) -> None:
    _ensure_db()
    DB_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Public API ────────────────────────────────────────────────────────────────

def get_all_conversations() -> list[dict]:
    """Return a summary list (no full messages) ordered newest-first."""
    db = _read_db()
    result = []
    for c in db["conversations"]:
        msgs = c.get("messages", [])
        last_preview = msgs[-1]["content"][:100] if msgs else ""
        result.append({
            "id":           c["id"],
            "title":        c["title"],
            "persona":      c.get("persona", "default"),
            "createdAt":    c["createdAt"],
            "updatedAt":    c["updatedAt"],
            "messageCount": len(msgs),
            "preview":      last_preview,
        })
    return result


def get_conversation(conv_id: str) -> dict | None:
    """Return the full conversation including all messages, or None."""
    db = _read_db()
    return next((c for c in db["conversations"] if c["id"] == conv_id), None)


def create_conversation(title: str = "New Conversation", persona: str = "default") -> dict:
    """Create a new conversation and persist it. Returns the new conversation."""
    db = _read_db()
    conversation = {
        "id":        str(uuid.uuid4()),
        "title":     title,
        "persona":   persona,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
        "messages":  [],
    }
    db["conversations"].insert(0, conversation)   # newest first
    _write_db(db)
    return conversation


def delete_conversation(conv_id: str) -> bool:
    """Delete a conversation by ID. Returns True if found and deleted."""
    db = _read_db()
    original_len = len(db["conversations"])
    db["conversations"] = [c for c in db["conversations"] if c["id"] != conv_id]
    if len(db["conversations"]) == original_len:
        return False
    _write_db(db)
    return True


def add_message(conv_id: str, role: str, content: str) -> dict:
    """
    Append a message to a conversation and update its timestamp.
    role: "user" | "model"
    Auto-generates title from the first user message.
    """
    db = _read_db()
    conv = next((c for c in db["conversations"] if c["id"] == conv_id), None)
    if conv is None:
        raise ValueError(f"Conversation not found: {conv_id}")

    message = {
        "id":        str(uuid.uuid4()),
        "role":      role,
        "content":   content,
        "timestamp": _now_iso(),
    }
    conv["messages"].append(message)
    conv["updatedAt"] = _now_iso()

    # Auto-title from first user message
    user_msgs = [m for m in conv["messages"] if m["role"] == "user"]
    if role == "user" and len(user_msgs) == 1:
        conv["title"] = content[:60] + ("…" if len(content) > 60 else "")

    _write_db(db)
    return message


def update_title(conv_id: str, title: str) -> bool:
    """Rename a conversation. Returns True on success."""
    db = _read_db()
    conv = next((c for c in db["conversations"] if c["id"] == conv_id), None)
    if conv is None:
        return False
    conv["title"]     = title
    conv["updatedAt"] = _now_iso()
    _write_db(db)
    return True


def search_conversations(query: str) -> list[dict]:
    """
    Full-text search across conversation titles and message content.
    Returns matches sorted by relevance (match count).
    """
    db      = _read_db()
    lower_q = query.lower()
    results = []

    for conv in db["conversations"]:
        title_match = lower_q in conv["title"].lower()
        matching_msgs = [
            m for m in conv.get("messages", [])
            if lower_q in m["content"].lower()
        ]
        if title_match or matching_msgs:
            results.append({
                "id":         conv["id"],
                "title":      conv["title"],
                "persona":    conv.get("persona", "default"),
                "createdAt":  conv["createdAt"],
                "updatedAt":  conv["updatedAt"],
                "matchCount": len(matching_msgs) + (1 if title_match else 0),
                "matchingMessages": [
                    {"role": m["role"], "preview": m["content"][:150], "timestamp": m["timestamp"]}
                    for m in matching_msgs[:3]
                ],
            })

    results.sort(key=lambda r: r["matchCount"], reverse=True)
    return results
