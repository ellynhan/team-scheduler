import sqlite3
import uuid
import json
import mimetypes
from pathlib import Path
from datetime import datetime
from threading import Lock

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel

app = FastAPI()

STATIC_DIR = Path(__file__).resolve().parent / "static"
DB_PATH = Path(__file__).resolve().parent / "scheduler.db"

_db_lock = Lock()
_db_conn = None


def get_conn():
    global _db_conn
    if _db_conn is None:
        _db_conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        _db_conn.row_factory = sqlite3.Row
        _db_conn.execute("PRAGMA journal_mode=WAL")
    return _db_conn


def db_execute(sql, params=()):
    with _db_lock:
        conn = get_conn()
        cur = conn.execute(sql, params)
        conn.commit()
        return cur


def db_fetchall(sql, params=()):
    with _db_lock:
        conn = get_conn()
        return conn.execute(sql, params).fetchall()


def db_fetchone(sql, params=()):
    with _db_lock:
        conn = get_conn()
        return conn.execute(sql, params).fetchone()


def _try_add_column(table, column, typedef):
    try:
        db_execute(f"ALTER TABLE {table} ADD COLUMN {column} {typedef}")
    except Exception:
        pass


def init_db():
    db_execute("""
        CREATE TABLE IF NOT EXISTS meetings (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            date_from TEXT NOT NULL,
            date_to TEXT NOT NULL,
            time_from INTEGER NOT NULL,
            time_to INTEGER NOT NULL,
            member_count INTEGER NOT NULL DEFAULT 6,
            members TEXT,
            group_id INTEGER,
            location TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TEXT NOT NULL
        )
    """)
    _try_add_column("meetings", "members", "TEXT")
    _try_add_column("meetings", "group_id", "INTEGER")
    _try_add_column("meetings", "location", "TEXT DEFAULT ''")
    _try_add_column("meetings", "note", "TEXT DEFAULT ''")

    db_execute("""
        CREATE TABLE IF NOT EXISTS availabilities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id TEXT NOT NULL,
            member_name TEXT NOT NULL,
            slots TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (meeting_id) REFERENCES meetings(id),
            UNIQUE(meeting_id, member_name)
        )
    """)
    db_execute("""
        CREATE TABLE IF NOT EXISTS member_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            members TEXT NOT NULL,
            password TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )
    """)
    _try_add_column("member_groups", "password", "TEXT NOT NULL DEFAULT ''")

    db_execute("CREATE INDEX IF NOT EXISTS idx_availabilities_meeting ON availabilities(meeting_id)")


init_db()

_cache = {"meetings": None, "groups": None}


def _load_meetings():
    rows = db_fetchall(
        "SELECT m.*, COUNT(a.id) as response_count "
        "FROM meetings m LEFT JOIN availabilities a ON m.id = a.meeting_id "
        "GROUP BY m.id ORDER BY m.date_to DESC"
    )
    _cache["meetings"] = [
        {
            "id": r["id"],
            "title": r["title"],
            "date_from": r["date_from"],
            "date_to": r["date_to"],
            "time_from": r["time_from"],
            "time_to": r["time_to"],
            "member_count": r["member_count"],
            "members": json.loads(r["members"]) if r["members"] else None,
            "group_id": r["group_id"],
            "location": r["location"] or "",
            "note": r["note"] or "",
            "response_count": r["response_count"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def _load_groups():
    rows = db_fetchall("SELECT * FROM member_groups ORDER BY name")
    _cache["groups"] = [
        {"id": r["id"], "name": r["name"], "members": json.loads(r["members"])}
        for r in rows
    ]


def _invalidate_meetings():
    _cache["meetings"] = None


def _invalidate_groups():
    _cache["groups"] = None


def get_meetings():
    if _cache["meetings"] is None:
        _load_meetings()
    return _cache["meetings"]


def get_groups():
    if _cache["groups"] is None:
        _load_groups()
    return _cache["groups"]


class MeetingCreate(BaseModel):
    title: str
    date_from: str
    date_to: str
    time_from: int = 9
    time_to: int = 18
    member_count: int = 6
    members: list[str] | None = None
    group_id: int | None = None
    location: str = ''
    note: str = ''


class GroupCreate(BaseModel):
    name: str
    members: list[str]
    password: str


class GroupUpdate(BaseModel):
    name: str
    members: list[str]
    password: str


class GroupDeleteRequest(BaseModel):
    password: str


class AvailabilitySubmit(BaseModel):
    member_name: str
    slots: dict[str, list[float | int]]


@app.get("/api/init")
def get_init_data():
    return {"meetings": get_meetings(), "groups": get_groups()}


@app.get("/static/{file_path:path}")
def serve_static(file_path: str):
    full_path = STATIC_DIR / file_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(404, "파일을 찾을 수 없습니다.")
    mime_type, _ = mimetypes.guess_type(str(full_path))
    return Response(
        content=full_path.read_bytes(),
        media_type=mime_type or "application/octet-stream",
    )


@app.post("/api/meetings")
def create_meeting(data: MeetingCreate):
    members_list = [m.strip() for m in data.members if m.strip()] if data.members else None
    member_count = data.member_count
    if members_list:
        member_count = len(members_list)
    if not 2 <= member_count <= 20:
        raise HTTPException(400, "멤버 수는 2~20명이어야 합니다.")
    meeting_id = uuid.uuid4().hex[:8]
    db_execute(
        "INSERT INTO meetings (id, title, date_from, date_to, time_from, time_to, member_count, members, group_id, location, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (meeting_id, data.title, data.date_from, data.date_to, data.time_from, data.time_to, member_count,
         json.dumps(members_list) if members_list else None, data.group_id,
         data.location.strip(), data.note.strip(), datetime.now().isoformat()),
    )
    _invalidate_meetings()
    return {"id": meeting_id}


@app.get("/api/meetings")
def list_meetings():
    return get_meetings()


@app.delete("/api/meetings/{meeting_id}")
def delete_meeting(meeting_id: str):
    row = db_fetchone("SELECT id FROM meetings WHERE id=?", (meeting_id,))
    if not row:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")
    db_execute("DELETE FROM availabilities WHERE meeting_id=?", (meeting_id,))
    db_execute("DELETE FROM meetings WHERE id=?", (meeting_id,))
    _invalidate_meetings()
    return {"status": "ok"}


@app.get("/api/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    row = db_fetchone("SELECT * FROM meetings WHERE id=?", (meeting_id,))
    if not row:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")
    availabilities = db_fetchall(
        "SELECT member_name, slots FROM availabilities WHERE meeting_id=?", (meeting_id,)
    )
    return {
        "id": row["id"],
        "title": row["title"],
        "date_from": row["date_from"],
        "date_to": row["date_to"],
        "time_from": row["time_from"],
        "time_to": row["time_to"],
        "member_count": row["member_count"],
        "location": row["location"] or "",
        "note": row["note"] or "",
        "preset_members": json.loads(row["members"]) if row["members"] else None,
        "availabilities": [
            {"member_name": a["member_name"], "slots": json.loads(a["slots"])}
            for a in availabilities
        ],
    }


@app.post("/api/meetings/{meeting_id}/availability")
def submit_availability(meeting_id: str, data: AvailabilitySubmit):
    if not data.member_name.strip():
        raise HTTPException(400, "이름을 입력해주세요.")
    row = db_fetchone("SELECT * FROM meetings WHERE id=?", (meeting_id,))
    if not row:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")
    existing_count = db_fetchone(
        "SELECT COUNT(DISTINCT member_name) as cnt FROM availabilities WHERE meeting_id=? AND member_name!=?",
        (meeting_id, data.member_name.strip()),
    )["cnt"]
    if existing_count >= row["member_count"]:
        raise HTTPException(400, f"최대 {row['member_count']}명까지 참여 가능합니다.")
    db_execute(
        "INSERT INTO availabilities (meeting_id, member_name, slots, updated_at) VALUES (?,?,?,?) "
        "ON CONFLICT(meeting_id, member_name) DO UPDATE SET slots=excluded.slots, updated_at=excluded.updated_at",
        (meeting_id, data.member_name.strip(), json.dumps(data.slots), datetime.now().isoformat()),
    )
    _invalidate_meetings()
    return {"status": "ok"}


@app.get("/api/meetings/{meeting_id}/common")
def get_common_slots(meeting_id: str):
    row = db_fetchone("SELECT * FROM meetings WHERE id=?", (meeting_id,))
    if not row:
        raise HTTPException(404, "일정을 찾을 수 없습니다.")
    availabilities = db_fetchall(
        "SELECT member_name, slots FROM availabilities WHERE meeting_id=?", (meeting_id,)
    )

    if not availabilities:
        return {
            "common_slots": {}, "member_count": 0, "total_members": row["member_count"],
            "individual": [], "slot_details": {},
        }

    all_slots = [json.loads(a["slots"]) for a in availabilities]
    member_names = [a["member_name"] for a in availabilities]

    individual = [
        {"name": a["member_name"], "slots": json.loads(a["slots"])}
        for a in availabilities
    ]

    slot_details = {}
    for i, slots in enumerate(all_slots):
        for date, hours in slots.items():
            if date not in slot_details:
                slot_details[date] = {}
            for h in hours:
                key = str(h)
                if key not in slot_details[date]:
                    slot_details[date][key] = []
                slot_details[date][key].append(member_names[i])

    all_dates = set()
    for s in all_slots:
        all_dates.update(s.keys())

    common = {}
    for date in sorted(all_dates):
        hours_sets = []
        for s in all_slots:
            if date in s:
                hours_sets.append(set(s[date]))
            else:
                hours_sets.append(set())
        common_hours = hours_sets[0]
        for hs in hours_sets[1:]:
            common_hours = common_hours & hs
        if common_hours:
            common[date] = sorted(common_hours)

    return {
        "common_slots": common,
        "member_count": len(availabilities),
        "total_members": row["member_count"],
        "members": member_names,
        "individual": individual,
        "slot_details": slot_details,
    }


@app.get("/api/groups")
def list_groups():
    return get_groups()


def validate_group_password(password: str):
    if not password or not password.isdigit():
        raise HTTPException(400, "비밀번호는 숫자만 입력 가능합니다.")
    if len(password) < 4 or len(password) > 8:
        raise HTTPException(400, "비밀번호는 4~8자리 숫자여야 합니다.")


@app.post("/api/groups")
def create_group(data: GroupCreate):
    if not data.name.strip():
        raise HTTPException(400, "그룹 이름을 입력해주세요.")
    members = [m.strip() for m in data.members if m.strip()]
    if len(members) < 2:
        raise HTTPException(400, "멤버는 2명 이상이어야 합니다.")
    validate_group_password(data.password)
    db_execute(
        "INSERT INTO member_groups (name, members, password, created_at) VALUES (?,?,?,?)",
        (data.name.strip(), json.dumps(members), data.password, datetime.now().isoformat()),
    )
    _invalidate_groups()
    return {"status": "ok"}


@app.put("/api/groups/{group_id}")
def update_group(group_id: int, data: GroupUpdate):
    if not data.name.strip():
        raise HTTPException(400, "그룹 이름을 입력해주세요.")
    members = [m.strip() for m in data.members if m.strip()]
    if len(members) < 2:
        raise HTTPException(400, "멤버는 2명 이상이어야 합니다.")
    row = db_fetchone("SELECT password FROM member_groups WHERE id=?", (group_id,))
    if not row:
        raise HTTPException(404, "그룹을 찾을 수 없습니다.")
    if row["password"] and row["password"] != data.password:
        raise HTTPException(403, "비밀번호가 일치하지 않습니다.")
    db_execute(
        "UPDATE member_groups SET name=?, members=? WHERE id=?",
        (data.name.strip(), json.dumps(members), group_id),
    )
    _invalidate_groups()
    return {"status": "ok"}


@app.post("/api/groups/{group_id}/delete")
def delete_group(group_id: int, data: GroupDeleteRequest):
    row = db_fetchone("SELECT password FROM member_groups WHERE id=?", (group_id,))
    if not row:
        raise HTTPException(404, "그룹을 찾을 수 없습니다.")
    if row["password"] and row["password"] != data.password:
        raise HTTPException(403, "비밀번호가 일치하지 않습니다.")
    db_execute("DELETE FROM member_groups WHERE id=?", (group_id,))
    _invalidate_groups()
    return {"status": "ok"}


@app.get("/")
@app.get("/meeting/{meeting_id}")
def serve_index(request: Request, meeting_id: str = None):
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html)
