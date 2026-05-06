import { state } from "./state.js";
import { BASE_PATH, apiPost } from "./api.js";
import { formatDate } from "./utils.js";
import { loadMeeting } from "./meeting-view.js";

export function initTimeSelects() {
  const fromSel = document.getElementById("time-from");
  const toSel = document.getElementById("time-to");
  for (let h = 0; h < 24; h++) {
    const label = `${String(h).padStart(2, "0")}:00`;
    fromSel.add(new Option(label, h));
    toSel.add(new Option(label, h));
  }
  fromSel.value = 9;
  toSel.value = 18;
}

export function initDateDefaults() {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  document.getElementById("date-from").value = formatDate(today);
  document.getElementById("date-to").value = formatDate(nextWeek);
}

export async function handleCreate(e) {
  e.preventDefault();
  const activeMode = document.querySelector(".member-mode-tab.active").dataset
    .mode;
  let presetMembers = null;
  let memberCount = 6;
  if (activeMode === "names") {
    const presetRaw = document.getElementById("preset-members").value.trim();
    presetMembers = presetRaw
      ? presetRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s)
      : null;
    if (!presetMembers || presetMembers.length < 2) {
      alert("참가자 이름을 2명 이상 입력해주세요.");
      return;
    }
    memberCount = presetMembers.length;
  } else {
    memberCount = parseInt(document.getElementById("member-count").value);
  }
  const body = {
    title: document.getElementById("title").value,
    date_from: document.getElementById("date-from").value,
    date_to: document.getElementById("date-to").value,
    time_from: parseInt(document.getElementById("time-from").value),
    time_to: parseInt(document.getElementById("time-to").value),
    member_count: memberCount,
    members: presetMembers,
    group_id:
      activeMode === "names" && state.selectedGroupId
        ? state.selectedGroupId
        : null,
    location: document.getElementById("meeting-location").value.trim(),
    note: document.getElementById("meeting-note").value.trim(),
  };
  if (body.date_from > body.date_to) {
    alert("종료 날짜가 시작 날짜보다 앞설 수 없습니다.");
    return;
  }
  if (body.time_from >= body.time_to) {
    alert("종료 시간이 시작 시간보다 뒤여야 합니다.");
    return;
  }
  try {
    const data = await apiPost("/api/meetings", body);
    window.history.pushState({}, "", `${BASE_PATH}/meeting/${data.id}`);
    loadMeeting(data.id);
  } catch (e) {
    alert(e.message || "생성 실패");
  }
}
