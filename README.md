# Team Scheduler

팀원들의 가능한 시간대를 수집하고 공통 시간대를 자동으로 찾아주는 일정 조율 웹 애플리케이션입니다.

## 주요 기능

- **일정 생성**: 날짜 범위, 시간대, 멤버 목록을 지정하여 일정 조율 세션 생성
- **가능 시간 제출**: 캘린더 UI에서 날짜 및 시간대를 드래그하여 직관적으로 입력
- **공통 시간대 계산**: 모든 참가자의 가능 시간 교집합을 자동 계산
- **후보 시간대 추천**: 가장 많은 인원이 참여 가능한 시간대를 우선 표시
- **그룹 프리셋**: 자주 만나는 팀을 그룹으로 저장하여 재사용
- **공유 링크**: URL을 통한 간편한 일정 공유

## 기술 스택

| 구분 | 기술 |
|------|------|
| 백엔드 | FastAPI, Python 3.10+ |
| 데이터베이스 | SQLite3 (WAL 모드) |
| 프론트엔드 | Vanilla JavaScript (ES Modules), HTML5, CSS3 |
| 서버 | Uvicorn (ASGI) |

## 디렉토리 구조

```
team-scheduler/
├── app.py                  # FastAPI 백엔드 (API 엔드포인트, DB 관리)
├── requirements.txt        # 런타임 의존성
├── requirements-dev.txt    # 개발/테스트 의존성
├── pytest.ini              # pytest 설정 (커버리지 포함)
├── tests/
│   └── test_app.py         # pytest 테스트 스위트 (100% 커버리지)
└── static/
    ├── index.html          # 단일 페이지 앱 진입점
    ├── style.css           # 전역 스타일시트
    └── js/
        ├── app.js          # 메인 진입점 및 이벤트 등록
        ├── api.js          # HTTP 요청 유틸리티
        ├── state.js        # 전역 상태 관리
        ├── utils.js        # 공통 유틸리티 함수
        ├── calendar.js     # 캘린더 렌더링 및 날짜/시간 선택
        ├── combo-search.js # 그룹 검색 컴포넌트
        ├── meeting-form.js # 일정 생성 폼
        ├── meeting-view.js # 일정 상세 페이지
        ├── meeting-list.js # 일정 목록 렌더링
        ├── group.js        # 그룹 관리
        └── result.js       # 공통 시간대 결과 표시
```

## 설치 및 실행

### 사전 요구사항

- Python 3.10 이상

### 설치

```bash
pip install -r requirements.txt
```

### 서버 실행

```bash
uvicorn app:app --reload
```

브라우저에서 `http://localhost:8000` 에 접속합니다.

## API 엔드포인트

### 초기화

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/init` | 일정 목록 및 그룹 목록 일괄 조회 |

### 일정 (Meetings)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/meetings` | 전체 일정 목록 조회 |
| `POST` | `/api/meetings` | 새 일정 생성 |
| `GET` | `/api/meetings/{id}` | 일정 상세 조회 (가능 시간 포함) |
| `DELETE` | `/api/meetings/{id}` | 일정 삭제 |
| `POST` | `/api/meetings/{id}/availability` | 가능 시간 제출 (UPSERT) |
| `GET` | `/api/meetings/{id}/common` | 공통 가능 시간 계산 결과 조회 |

#### 일정 생성 요청 본문

```json
{
  "title": "주간 회의",
  "date_from": "2025-01-06",
  "date_to": "2025-01-10",
  "time_from": 9,
  "time_to": 18,
  "member_count": 4,
  "members": ["홍길동", "김철수", "이영희", "박민준"],
  "group_id": null,
  "location": "회의실 A",
  "note": "준비물: 노트북"
}
```

- `members` 제공 시 `member_count`는 자동으로 멤버 수로 설정됩니다.
- `member_count`는 2 ~ 20 사이여야 합니다.

#### 가능 시간 제출 요청 본문

```json
{
  "member_name": "홍길동",
  "slots": {
    "2025-01-06": [9.0, 9.5, 10.0, 10.5],
    "2025-01-07": [14.0, 14.5, 15.0]
  }
}
```

- 슬롯은 30분 단위 (예: `9.0` = 09:00, `9.5` = 09:30)

### 그룹 (Groups)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/groups` | 그룹 목록 조회 |
| `POST` | `/api/groups` | 그룹 생성 |
| `PUT` | `/api/groups/{id}` | 그룹 수정 |
| `POST` | `/api/groups/{id}/delete` | 그룹 삭제 |

- 그룹 비밀번호는 **4 ~ 8자리 숫자**여야 합니다.

## 데이터베이스 스키마

```sql
-- 일정
CREATE TABLE meetings (
    id TEXT PRIMARY KEY,          -- 8자리 UUID hex
    title TEXT NOT NULL,
    date_from TEXT NOT NULL,      -- YYYY-MM-DD
    date_to TEXT NOT NULL,
    time_from INTEGER NOT NULL,   -- 시작 시각 (정수 시)
    time_to INTEGER NOT NULL,     -- 종료 시각 (정수 시)
    member_count INTEGER NOT NULL DEFAULT 6,
    members TEXT,                 -- JSON 배열 또는 NULL
    group_id INTEGER,
    location TEXT DEFAULT '',
    note TEXT DEFAULT '',
    created_at TEXT NOT NULL
);

-- 가능 시간 응답
CREATE TABLE availabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    member_name TEXT NOT NULL,
    slots TEXT NOT NULL,          -- JSON: {"YYYY-MM-DD": [float, ...]}
    updated_at TEXT NOT NULL,
    UNIQUE(meeting_id, member_name)
);

-- 멤버 그룹
CREATE TABLE member_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    members TEXT NOT NULL,        -- JSON 배열
    password TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
```

## 개발 환경 설정

### 테스트 의존성 설치

```bash
pip install -r requirements-dev.txt
```

### 테스트 실행

```bash
# 커버리지 리포트와 함께 실행
pytest

# 상세 출력
pytest -v

# HTML 커버리지 리포트 생성
pytest --cov-report=html
```

`pytest.ini`에 `--cov=app --cov-branch --cov-report=term-missing`이 기본 설정되어 있어 매 실행 시 커버리지를 확인할 수 있습니다.
