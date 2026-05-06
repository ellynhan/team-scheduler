import { state } from "./state.js";
import { BASE_PATH, apiFetch, apiDelete } from "./api.js";
import { formatDate } from "./utils.js";
import { loadMeeting } from "./meeting-view.js";

export async function loadInitData() {
  const loading = document.getElementById("meeting-list-loading");
  try {
    const data = await apiFetch("/api/init");
    state.allGroups = data.groups || [];
    state.cachedMeetings = data.meetings || [];
    if (!window.location.pathname.match(/\/meeting\//)) {
      loading.style.display = "none";
      renderMeetingList(state.cachedMeetings, state.allGroups);
    }
  } catch {
    loading.textContent = "데이터를 불러올 수 없습니다.";
  }
}

export async function loadMeetingList() {
  const loading = document.getElementById("meeting-list-loading");
  loading.style.display = "block";
  try {
    const data = await apiFetch("/api/init");
    state.allGroups = data.groups || [];
    state.cachedMeetings = data.meetings || [];
    loading.style.display = "none";
    renderMeetingList(state.cachedMeetings, state.allGroups);
  } catch {
    loading.textContent = "목록을 불러올 수 없습니다.";
  }
}

export function renderMeetingList(meetings, groups) {
  const upcomingDiv = document.getElementById("upcoming-meetings");
  const pastDiv = document.getElementById("past-meetings");
  upcomingDiv.innerHTML = "";
  pastDiv.innerHTML = "";
  if (state.meetingFilterGroupId) {
    meetings = meetings.filter(
      (m) => m.group_id === state.meetingFilterGroupId,
    );
  }
  if (meetings.length === 0) {
    upcomingDiv.innerHTML =
      '<div class="no-common">' +
      (state.meetingFilterGroupId
        ? "해당 그룹의 일정이 없습니다."
        : "아직 생성된 일정이 없습니다.") +
      "</div>";
    return;
  }
  const groupMap = {};
  groups.forEach((g) => {
    groupMap[g.id] = g.name;
  });
  const now = new Date();
  const today = formatDate(now);
  const currentHour = now.getHours();
  const isMeetingEnded = (m) => {
    if (m.date_to < today) return true;
    if (m.date_to === today && currentHour >= (m.time_to || 24)) return true;
    return false;
  };
  const getGroupLabel = (m) => {
    if (m.group_id && groupMap[m.group_id]) return groupMap[m.group_id];
    if (m.members && m.members.length > 0)
      return m.members.slice().sort().join(", ");
    return "기타";
  };
  const upcoming = meetings
    .filter((m) => !isMeetingEnded(m))
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const past = meetings
    .filter((m) => isMeetingEnded(m))
    .sort((a, b) => b.date_to.localeCompare(a.date_to));
  let nearestId = null;
  if (upcoming.length > 0) {
    let nearest = upcoming[0];
    for (const m of upcoming) {
      if (
        m.date_from >= today &&
        (nearest.date_from < today || m.date_from < nearest.date_from)
      ) {
        nearest = m;
      }
    }
    nearestId = nearest.id;
  }
  const renderGrouped = (list, container, isUpcoming) => {
    const grouped = {};
    list.forEach((m) => {
      const label = getGroupLabel(m);
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(m);
    });
    Object.keys(grouped).forEach((label) => {
      const header = document.createElement("div");
      header.className = "meeting-group-header";
      header.textContent = `${label} (${grouped[label].length})`;
      container.appendChild(header);
      grouped[label].forEach((m) => {
        container.appendChild(
          createMeetingListCard(
            m,
            isUpcoming && m.id === nearestId,
            !isUpcoming,
          ),
        );
      });
    });
  };
  if (upcoming.length > 0) {
    const title = document.createElement("h3");
    title.className = "meeting-list-title";
    title.textContent = `예정된 일정 (${upcoming.length})`;
    upcomingDiv.appendChild(title);
    renderGrouped(upcoming, upcomingDiv, true);
  }
  if (past.length > 0) {
    const title = document.createElement("h3");
    title.className = "meeting-list-title meeting-list-title-past";
    title.textContent = `종료된 일정 (${past.length})`;
    pastDiv.appendChild(title);
    renderGrouped(past, pastDiv, false);
  }
}

function createMeetingListCard(meeting, isNearest, isPast) {
  const card = document.createElement("div");
  card.className = "meeting-list-card";
  if (isNearest) card.classList.add("nearest");
  if (isPast) card.classList.add("past");
  card.addEventListener("click", () => {
    window.history.pushState({}, "", `${BASE_PATH}/meeting/${meeting.id}`);
    loadMeeting(meeting.id);
  });
  const top = document.createElement("div");
  top.className = "meeting-list-card-top";
  const titleEl = document.createElement("span");
  titleEl.className = "meeting-list-card-title";
  titleEl.textContent = meeting.title;
  top.appendChild(titleEl);
  if (isNearest) {
    const badge = document.createElement("span");
    badge.className = "nearest-badge";
    badge.textContent = "다가오는 일정";
    top.appendChild(badge);
  }
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-delete-small";
  deleteBtn.textContent = "삭제";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteMeeting(meeting.id, meeting.title);
  });
  top.appendChild(deleteBtn);
  card.appendChild(top);
  const info = document.createElement("div");
  info.className = "meeting-list-card-info";
  const [, m1, d1] = meeting.date_from.split("-");
  const [, m2, d2] = meeting.date_to.split("-");
  info.textContent =
    `${parseInt(m1)}/${parseInt(d1)} ~ ${parseInt(m2)}/${parseInt(d2)} ` +
    `| 응답 ${meeting.response_count}/${meeting.member_count}명`;
  card.appendChild(info);
  if (meeting.location || meeting.note) {
    const detail = document.createElement("div");
    detail.className = "meeting-list-card-detail";
    const parts = [];
    if (meeting.location) parts.push(`장소: ${meeting.location}`);
    if (meeting.note) parts.push(`비고: ${meeting.note}`);
    detail.textContent = parts.join(" | ");
    card.appendChild(detail);
  }
  return card;
}

export async function deleteMeeting(id, title) {
  if (
    !confirm(
      `"${title}" 일정을 삭제하시겠습니까?\n응답 데이터도 함께 삭제됩니다.`,
    )
  )
    return;
  try {
    await apiDelete(`/api/meetings/${id}`);
  } catch (e) {
    alert(e.message || "삭제 실패");
    return;
  }
  if (state.currentMeetingId === id) {
    const { goHome } = await import("./meeting-view.js");
    goHome();
  } else {
    loadMeetingList();
  }
}
