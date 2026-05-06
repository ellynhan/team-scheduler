import { state } from "./state.js";
import { BASE_PATH, apiFetch, apiPost } from "./api.js";
import { copyToClipboard } from "./utils.js";
import { renderCalendar } from "./calendar.js";
import { loadResults } from "./results.js";
import { loadMeetingList } from "./meeting-list.js";

export async function loadMeeting(id) {
  state.currentMeetingId = id;
  try {
    state.meetingData = await apiFetch(`/api/meetings/${id}`);
  } catch {
    alert("일정을 찾을 수 없습니다.");
    return;
  }
  state.selectedSlots = {};
  state.calRangeStart = null;
  state.calRangeEnd = null;
  showMeetingView();
}

function showMeetingView() {
  document.getElementById("create-section").style.display = "none";
  document.getElementById("meeting-list-section").style.display = "none";
  document.getElementById("meeting-section").style.display = "block";
  const md = state.meetingData;
  document.getElementById("meeting-title").textContent = md.title;
  let infoHtml =
    `기간: ${md.date_from} ~ ${md.date_to} &nbsp;|&nbsp; ` +
    `참여: ${md.availabilities.length}/${md.member_count}명`;
  if (md.location) infoHtml += `<br>장소: ${md.location}`;
  if (md.note) infoHtml += `<br>비고: ${md.note}`;
  document.getElementById("meeting-info").innerHTML = infoHtml;
  document.getElementById("share-link").value =
    `${window.location.origin}${BASE_PATH}/meeting/${state.currentMeetingId}`;
  renderNameArea();
  const fromDate = new Date(md.date_from + "T00:00:00");
  state.currentMonth = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  renderCalendar();
  loadResults();
}

function renderNameArea() {
  const textInput = document.getElementById("name-text-input");
  const buttonsArea = document.getElementById("name-buttons-area");
  const buttonsContainer = document.getElementById("name-buttons");
  const nameInput = document.getElementById("member-name");
  const presetMembers = state.meetingData.preset_members;
  if (presetMembers && presetMembers.length > 0) {
    textInput.style.display = "none";
    buttonsArea.style.display = "block";
    buttonsContainer.innerHTML = "";
    const submittedNames = state.meetingData.availabilities.map(
      (a) => a.member_name,
    );
    presetMembers.forEach((name) => {
      const btn = document.createElement("button");
      btn.className = "name-btn";
      btn.textContent = name;
      if (submittedNames.includes(name)) btn.classList.add("submitted");
      if (nameInput.value === name) btn.classList.add("active");
      btn.addEventListener("click", () => {
        nameInput.value = name;
        buttonsContainer
          .querySelectorAll(".name-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      });
      buttonsContainer.appendChild(btn);
    });
  } else {
    textInput.style.display = "block";
    buttonsArea.style.display = "none";
  }
}

export async function handleSubmit() {
  const name = document.getElementById("member-name").value.trim();
  if (!name) {
    alert("이름을 입력해주세요.");
    return;
  }
  const filtered = {};
  for (const [date, slots] of Object.entries(state.selectedSlots)) {
    if (slots.length > 0) filtered[date] = slots;
  }
  if (Object.keys(filtered).length === 0) {
    alert("최소 하나의 시간대를 선택해주세요.");
    return;
  }
  try {
    await apiPost(`/api/meetings/${state.currentMeetingId}/availability`, {
      member_name: name,
      slots: filtered,
    });
    alert(`${name}님의 가능 시간이 제출되었습니다!`);
    loadMeeting(state.currentMeetingId);
  } catch (e) {
    alert(e.message || "제출 실패");
  }
}

export function handleCopy() {
  const input = document.getElementById("share-link");
  input.select();
  input.setSelectionRange(0, input.value.length);
  copyToClipboard(input.value, document.getElementById("copy-btn"));
}

export function goHome() {
  state.currentMeetingId = null;
  state.meetingData = null;
  state.selectedSlots = {};
  state.calRangeStart = null;
  state.calRangeEnd = null;
  document.getElementById("meeting-section").style.display = "none";
  document.getElementById("create-section").style.display = "block";
  document.getElementById("meeting-list-section").style.display = "block";
  window.history.pushState({}, "", BASE_PATH + "/");
  loadMeetingList();
}

export function checkRoute() {
  const path = window.location.pathname;
  const match = path.match(/\/meeting\/([a-f0-9]+)$/);
  if (match) loadMeeting(match[1]);
}
