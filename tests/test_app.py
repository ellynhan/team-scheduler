import json
import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import app


# ─── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    """각 테스트마다 격리된 임시 DB를 사용한다."""
    db_file = tmp_path / "test.db"
    monkeypatch.setattr(app_module, "DB_PATH", db_file)
    monkeypatch.setattr(app_module, "_db_conn", None)
    monkeypatch.setattr(app_module, "_cache", {"meetings": None, "groups": None})
    app_module.init_db()
    yield
    # monkeypatch 복원 전에 테스트용 연결을 닫는다
    if app_module._db_conn is not None:
        app_module._db_conn.close()


@pytest.fixture
def client():
    return TestClient(app)


# ─── 헬퍼 ─────────────────────────────────────────────────────────────────────


def _create_meeting(client, **kwargs):
    payload = {
        "title": "테스트 일정",
        "date_from": "2025-01-06",
        "date_to": "2025-01-10",
        "time_from": 9,
        "time_to": 18,
        "member_count": 4,
        **kwargs,
    }
    resp = client.post("/api/meetings", json=payload)
    assert resp.status_code == 200
    return resp.json()["id"]


def _create_group(client, name="팀A", members=None, password="1234"):
    members = members or ["홍길동", "김철수"]
    before = {g["id"] for g in client.get("/api/groups").json()}
    resp = client.post("/api/groups", json={"name": name, "members": members, "password": password})
    assert resp.status_code == 200
    after = client.get("/api/groups").json()
    new = [g for g in after if g["id"] not in before]
    assert len(new) == 1, "그룹이 정확히 1개 생성되어야 한다"
    return new[0]["id"]


# ─── DB 레이어 ─────────────────────────────────────────────────────────────────


class TestGetConn:
    def test_creates_connection_when_none(self):
        # fresh_db 픽스처가 init_db()를 통해 이미 연결을 생성했으므로
        # 명시적으로 닫고 None 으로 초기화한 뒤 재생성 경로를 검증한다
        if app_module._db_conn:
            app_module._db_conn.close()
        app_module._db_conn = None
        conn = app_module.get_conn()
        assert conn is not None

    def test_reuses_existing_connection(self):
        conn1 = app_module.get_conn()
        conn2 = app_module.get_conn()
        assert conn1 is conn2


class TestTryAddColumn:
    def test_success_new_column(self):
        app_module._try_add_column("meetings", "test_new_col", "TEXT DEFAULT 'x'")
        conn = app_module.get_conn()
        cols = [row[1] for row in conn.execute("PRAGMA table_info(meetings)").fetchall()]
        assert "test_new_col" in cols

    def test_silently_ignores_existing_column(self):
        # 'title' 은 이미 존재 → 예외를 무시해야 한다
        app_module._try_add_column("meetings", "title", "TEXT")


class TestDbHelpers:
    def test_execute_and_fetchone(self):
        app_module.db_execute(
            "INSERT INTO meetings (id,title,date_from,date_to,time_from,time_to,member_count,created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            ("abc1", "X", "2025-01-01", "2025-01-02", 9, 18, 2, "2025-01-01T00:00:00"),
        )
        row = app_module.db_fetchone("SELECT id FROM meetings WHERE id=?", ("abc1",))
        assert row["id"] == "abc1"

    def test_fetchall_returns_list(self):
        result = app_module.db_fetchall("SELECT * FROM meetings")
        assert isinstance(result, list)


# ─── 캐시 헬퍼 ─────────────────────────────────────────────────────────────────


class TestGetMeetingsCache:
    def test_loads_when_cache_is_none(self, client):
        assert app_module._cache["meetings"] is None
        result = app_module.get_meetings()
        assert isinstance(result, list)
        assert app_module._cache["meetings"] is not None

    def test_returns_same_object_on_second_call(self, client):
        app_module.get_meetings()
        sentinel = app_module._cache["meetings"]
        assert app_module.get_meetings() is sentinel


class TestGetGroupsCache:
    def test_loads_when_cache_is_none(self):
        assert app_module._cache["groups"] is None
        result = app_module.get_groups()
        assert isinstance(result, list)

    def test_returns_same_object_on_second_call(self):
        app_module.get_groups()
        sentinel = app_module._cache["groups"]
        assert app_module.get_groups() is sentinel


class TestInvalidate:
    def test_invalidate_meetings_sets_none(self):
        app_module.get_meetings()
        app_module._invalidate_meetings()
        assert app_module._cache["meetings"] is None

    def test_invalidate_groups_sets_none(self):
        app_module.get_groups()
        app_module._invalidate_groups()
        assert app_module._cache["groups"] is None


class TestLoadMeetings:
    def test_members_field_none(self, client):
        _create_meeting(client)
        app_module._invalidate_meetings()
        meetings = app_module.get_meetings()
        assert any(m["members"] is None for m in meetings)

    def test_members_field_parsed_from_json(self, client):
        _create_meeting(client, members=["Alice", "Bob"])
        app_module._invalidate_meetings()
        meetings = app_module.get_meetings()
        assert any(m["members"] == ["Alice", "Bob"] for m in meetings)

    def test_location_and_note_non_empty(self, client):
        _create_meeting(client, location="서울", note="메모")
        app_module._invalidate_meetings()
        meetings = app_module.get_meetings()
        assert any(m["location"] == "서울" and m["note"] == "메모" for m in meetings)


# ─── GET /api/init ─────────────────────────────────────────────────────────────


class TestGetInit:
    def test_returns_meetings_and_groups_keys(self, client):
        data = client.get("/api/init").json()
        assert "meetings" in data
        assert "groups" in data


# ─── GET /static/{path} ───────────────────────────────────────────────────────


class TestServeStatic:
    def test_existing_html_file(self, client):
        resp = client.get("/static/index.html")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    def test_missing_file_returns_404(self, client):
        assert client.get("/static/no_such_file_xyz.html").status_code == 404

    def test_unknown_extension_uses_octet_stream(self, client, tmp_path, monkeypatch):
        static_dir = tmp_path / "static"
        static_dir.mkdir()
        (static_dir / "data.bin").write_bytes(b"\x00\x01\x02")
        monkeypatch.setattr(app_module, "STATIC_DIR", static_dir)
        resp = client.get("/static/data.bin")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/octet-stream"


# ─── POST /api/meetings ────────────────────────────────────────────────────────


class TestCreateMeeting:
    def test_with_member_count(self, client):
        resp = client.post("/api/meetings", json={
            "title": "회의", "date_from": "2025-01-06", "date_to": "2025-01-10",
            "member_count": 3,
        })
        assert resp.status_code == 200
        assert "id" in resp.json()

    def test_with_members_list(self, client):
        resp = client.post("/api/meetings", json={
            "title": "회의", "date_from": "2025-01-06", "date_to": "2025-01-10",
            "members": ["Alice", "Bob", "Charlie"],
        })
        assert resp.status_code == 200

    def test_members_list_strips_whitespace(self, client):
        mid = _create_meeting(client, members=["Alice", "  ", "Bob"])
        data = client.get(f"/api/meetings/{mid}").json()
        assert data["preset_members"] == ["Alice", "Bob"]

    def test_members_all_blank_falls_back_to_member_count(self, client):
        resp = client.post("/api/meetings", json={
            "title": "회의", "date_from": "2025-01-06", "date_to": "2025-01-10",
            "members": [" ", "  "], "member_count": 3,
        })
        assert resp.status_code == 200
        mid = resp.json()["id"]
        data = client.get(f"/api/meetings/{mid}").json()
        assert data["member_count"] == 3

    def test_member_count_too_low(self, client):
        resp = client.post("/api/meetings", json={
            "title": "회의", "date_from": "2025-01-06", "date_to": "2025-01-10",
            "member_count": 1,
        })
        assert resp.status_code == 400

    def test_member_count_too_high(self, client):
        resp = client.post("/api/meetings", json={
            "title": "회의", "date_from": "2025-01-06", "date_to": "2025-01-10",
            "member_count": 21,
        })
        assert resp.status_code == 400

    def test_with_optional_fields(self, client):
        resp = client.post("/api/meetings", json={
            "title": "회의", "date_from": "2025-01-06", "date_to": "2025-01-10",
            "member_count": 2, "group_id": 1, "location": "서울", "note": "메모",
        })
        assert resp.status_code == 200


# ─── GET /api/meetings ─────────────────────────────────────────────────────────


class TestListMeetings:
    def test_empty_list(self, client):
        assert client.get("/api/meetings").json() == []

    def test_contains_created_meeting(self, client):
        _create_meeting(client)
        assert len(client.get("/api/meetings").json()) == 1


# ─── DELETE /api/meetings/{id} ─────────────────────────────────────────────────


class TestDeleteMeeting:
    def test_success(self, client):
        mid = _create_meeting(client)
        resp = client.delete(f"/api/meetings/{mid}")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert client.get(f"/api/meetings/{mid}").status_code == 404

    def test_cascades_availabilities(self, client):
        mid = _create_meeting(client)
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [9.0]},
        })
        client.delete(f"/api/meetings/{mid}")
        rows = app_module.db_fetchall(
            "SELECT id FROM availabilities WHERE meeting_id=?", (mid,)
        )
        assert rows == []

    def test_not_found(self, client):
        assert client.delete("/api/meetings/notexist").status_code == 404


# ─── GET /api/meetings/{id} ────────────────────────────────────────────────────


class TestGetMeeting:
    def test_success_no_preset_members(self, client):
        mid = _create_meeting(client)
        data = client.get(f"/api/meetings/{mid}").json()
        assert data["id"] == mid
        assert data["preset_members"] is None

    def test_success_with_preset_members(self, client):
        mid = _create_meeting(client, members=["Alice", "Bob"])
        data = client.get(f"/api/meetings/{mid}").json()
        assert data["preset_members"] == ["Alice", "Bob"]

    def test_not_found(self, client):
        assert client.get("/api/meetings/notexist").status_code == 404


# ─── POST /api/meetings/{id}/availability ─────────────────────────────────────


class TestSubmitAvailability:
    def test_success(self, client):
        mid = _create_meeting(client)
        resp = client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [9.0, 9.5]},
        })
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_upsert_same_member_updates_slots(self, client):
        mid = _create_meeting(client)
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [9.0]},
        })
        resp = client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [10.0]},
        })
        assert resp.status_code == 200
        detail = client.get(f"/api/meetings/{mid}").json()
        alice = next(a for a in detail["availabilities"] if a["member_name"] == "Alice")
        assert alice["slots"] == {"2025-01-06": [10.0]}

    def test_empty_name_returns_400(self, client):
        mid = _create_meeting(client)
        resp = client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "   ", "slots": {},
        })
        assert resp.status_code == 400

    def test_meeting_not_found(self, client):
        resp = client.post("/api/meetings/notexist/availability", json={
            "member_name": "Alice", "slots": {},
        })
        assert resp.status_code == 404

    def test_capacity_exceeded_returns_400(self, client):
        mid = _create_meeting(client, member_count=2)
        client.post(f"/api/meetings/{mid}/availability", json={"member_name": "A", "slots": {}})
        client.post(f"/api/meetings/{mid}/availability", json={"member_name": "B", "slots": {}})
        resp = client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "C", "slots": {},
        })
        assert resp.status_code == 400


# ─── GET /api/meetings/{id}/common ────────────────────────────────────────────


class TestCommonSlots:
    def test_meeting_not_found(self, client):
        assert client.get("/api/meetings/notexist/common").status_code == 404

    def test_no_availabilities(self, client):
        mid = _create_meeting(client)
        data = client.get(f"/api/meetings/{mid}/common").json()
        assert data["common_slots"] == {}
        assert data["member_count"] == 0

    def test_single_member(self, client):
        mid = _create_meeting(client)
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [9.0, 9.5]},
        })
        data = client.get(f"/api/meetings/{mid}/common").json()
        assert data["member_count"] == 1
        assert sorted(data["common_slots"]["2025-01-06"]) == [9.0, 9.5]

    def test_two_members_with_overlap(self, client):
        mid = _create_meeting(client)
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [9.0, 9.5, 10.0]},
        })
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Bob", "slots": {"2025-01-06": [9.0, 9.5]},
        })
        data = client.get(f"/api/meetings/{mid}/common").json()
        assert sorted(data["common_slots"]["2025-01-06"]) == [9.0, 9.5]

    def test_two_members_no_overlap(self, client):
        mid = _create_meeting(client)
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice", "slots": {"2025-01-06": [9.0]},
        })
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Bob", "slots": {"2025-01-06": [10.0]},
        })
        data = client.get(f"/api/meetings/{mid}/common").json()
        assert "2025-01-06" not in data["common_slots"]

    def test_date_absent_for_one_member_yields_empty_intersection(self, client):
        mid = _create_meeting(client)
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Alice",
            "slots": {"2025-01-06": [9.0], "2025-01-07": [10.0]},
        })
        client.post(f"/api/meetings/{mid}/availability", json={
            "member_name": "Bob", "slots": {"2025-01-06": [9.0]},
        })
        data = client.get(f"/api/meetings/{mid}/common").json()
        assert "2025-01-06" in data["common_slots"]
        assert "2025-01-07" not in data["common_slots"]


# ─── validate_group_password ───────────────────────────────────────────────────


class TestValidateGroupPassword:
    def test_empty_string_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["A", "B"], "password": "",
        })
        assert resp.status_code == 400

    def test_non_digit_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["A", "B"], "password": "abcd",
        })
        assert resp.status_code == 400

    def test_too_short_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["A", "B"], "password": "123",
        })
        assert resp.status_code == 400

    def test_too_long_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["A", "B"], "password": "123456789",
        })
        assert resp.status_code == 400


# ─── GET /api/groups ───────────────────────────────────────────────────────────


class TestListGroups:
    def test_empty_list(self, client):
        assert client.get("/api/groups").json() == []

    def test_contains_created_group(self, client):
        _create_group(client)
        assert len(client.get("/api/groups").json()) == 1


# ─── POST /api/groups ──────────────────────────────────────────────────────────


class TestCreateGroup:
    def test_success(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["홍길동", "김철수"], "password": "1234",
        })
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_empty_name_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "   ", "members": ["A", "B"], "password": "1234",
        })
        assert resp.status_code == 400

    def test_too_few_members_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["홍길동"], "password": "1234",
        })
        assert resp.status_code == 400

    def test_members_whitespace_stripped(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": ["A", " ", "B"], "password": "1234",
        })
        assert resp.status_code == 200

    def test_members_all_whitespace_returns_400(self, client):
        resp = client.post("/api/groups", json={
            "name": "팀A", "members": [" ", "  "], "password": "1234",
        })
        assert resp.status_code == 400


# ─── PUT /api/groups/{id} ──────────────────────────────────────────────────────


class TestUpdateGroup:
    def test_success(self, client):
        gid = _create_group(client, password="1234")
        resp = client.put(f"/api/groups/{gid}", json={
            "name": "팀B", "members": ["A", "B", "C"], "password": "1234",
        })
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        updated = next(g for g in client.get("/api/groups").json() if g["id"] == gid)
        assert updated["name"] == "팀B"
        assert updated["members"] == ["A", "B", "C"]

    def test_empty_name_returns_400(self, client):
        gid = _create_group(client)
        resp = client.put(f"/api/groups/{gid}", json={
            "name": "  ", "members": ["A", "B"], "password": "1234",
        })
        assert resp.status_code == 400

    def test_too_few_members_returns_400(self, client):
        gid = _create_group(client)
        resp = client.put(f"/api/groups/{gid}", json={
            "name": "팀A", "members": ["A"], "password": "1234",
        })
        assert resp.status_code == 400

    def test_not_found_returns_404(self, client):
        resp = client.put("/api/groups/99999", json={
            "name": "팀A", "members": ["A", "B"], "password": "1234",
        })
        assert resp.status_code == 404

    def test_wrong_password_returns_403(self, client):
        gid = _create_group(client, password="1234")
        resp = client.put(f"/api/groups/{gid}", json={
            "name": "팀B", "members": ["A", "B"], "password": "9999",
        })
        assert resp.status_code == 403

    def test_no_stored_password_bypasses_check(self, client):
        app_module.db_execute(
            "INSERT INTO member_groups (name, members, password, created_at) VALUES (?,?,?,?)",
            ("팀X", json.dumps(["A", "B"]), "", "2025-01-01T00:00:00"),
        )
        app_module._invalidate_groups()
        gid = client.get("/api/groups").json()[0]["id"]
        resp = client.put(f"/api/groups/{gid}", json={
            "name": "팀X수정", "members": ["A", "B"], "password": "anyvalue",
        })
        assert resp.status_code == 200


# ─── POST /api/groups/{id}/delete ──────────────────────────────────────────────


class TestDeleteGroup:
    def test_success(self, client):
        gid = _create_group(client, password="1234")
        resp = client.post(f"/api/groups/{gid}/delete", json={"password": "1234"})
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert all(g["id"] != gid for g in client.get("/api/groups").json())

    def test_not_found_returns_404(self, client):
        resp = client.post("/api/groups/99999/delete", json={"password": "1234"})
        assert resp.status_code == 404

    def test_wrong_password_returns_403(self, client):
        gid = _create_group(client, password="1234")
        resp = client.post(f"/api/groups/{gid}/delete", json={"password": "9999"})
        assert resp.status_code == 403

    def test_no_stored_password_bypasses_check(self, client):
        app_module.db_execute(
            "INSERT INTO member_groups (name, members, password, created_at) VALUES (?,?,?,?)",
            ("팀X", json.dumps(["A", "B"]), "", "2025-01-01T00:00:00"),
        )
        app_module._invalidate_groups()
        gid = client.get("/api/groups").json()[0]["id"]
        resp = client.post(f"/api/groups/{gid}/delete", json={"password": "anyvalue"})
        assert resp.status_code == 200


# ─── GET / 및 GET /meeting/{id} ────────────────────────────────────────────────


class TestServeIndex:
    def test_root_returns_html(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]

    def test_meeting_page_returns_html(self, client):
        resp = client.get("/meeting/abc123")
        assert resp.status_code == 200
        assert "text/html" in resp.headers["content-type"]
