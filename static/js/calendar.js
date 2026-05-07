import { state } from "./state.js";
import {
  formatDate,
  getDatesBetween,
  getTimeRange,
  formatSlotLabel,
} from "./utils.js";

export function getCalRangeMin() {
  if (!state.calRangeStart) return null;
  const end = state.calRangeEnd || state.calRangeStart;
  return state.calRangeStart <= end ? state.calRangeStart : end;
}

export function getCalRangeMax() {
  if (!state.calRangeStart) return null;
  const end = state.calRangeEnd || state.calRangeStart;
  return state.calRangeStart <= end ? end : state.calRangeStart;
}

export function navigateMonth(delta) {
  state.currentMonth.setMonth(state.currentMonth.getMonth() + delta);
  renderCalendar();
}

export function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  days.forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-header";
    el.textContent = d;
    grid.appendChild(el);
  });
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  document.getElementById("calendar-month-label").textContent =
    `${year}년 ${month + 1}월`;
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const dateFrom = new Date(state.meetingData.date_from + "T00:00:00");
  const dateTo = new Date(state.meetingData.date_to + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeMin = getCalRangeMin();
  const rangeMax = getCalRangeMax();
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement("div");
    el.className = "cal-day disabled";
    grid.appendChild(el);
  }
  for (let d = 1; d <= lastDate; d++) {
    const el = document.createElement("div");
    el.className = "cal-day";
    el.textContent = d;
    const cellDate = new Date(year, month, d);
    const dateStr = formatDate(cellDate);
    el.dataset.date = dateStr;
    if (cellDate < dateFrom || cellDate > dateTo) {
      el.classList.add("out-of-range");
    } else {
      if (rangeMin && rangeMax && dateStr >= rangeMin && dateStr <= rangeMax) {
        el.classList.add("in-range");
        if (dateStr === rangeMin) el.classList.add("range-start");
        if (dateStr === rangeMax) el.classList.add("range-end");
      }
      if (
        state.selectedSlots[dateStr] &&
        state.selectedSlots[dateStr].length > 0
      ) {
        el.classList.add("has-selection");
      }
      if (cellDate.getTime() === today.getTime()) {
        el.classList.add("today");
      }
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (e.shiftKey && state.calRangeStart) {
          state.calRangeEnd = dateStr;
        } else {
          state.calDragging = true;
          state.calRangeStart = dateStr;
          state.calRangeEnd = dateStr;
        }
        renderCalendar();
        showTimeBar();
      });
      el.addEventListener("mouseenter", () => {
        if (state.calDragging) {
          state.calRangeEnd = dateStr;
          renderCalendar();
          showTimeBar();
        }
      });
      el.addEventListener(
        "touchstart",
        (e) => {
          e.preventDefault();
          state.calDragging = true;
          state.calRangeStart = dateStr;
          state.calRangeEnd = dateStr;
          renderCalendar();
          showTimeBar();
        },
        { passive: false },
      );
      el.addEventListener(
        "touchmove",
        (e) => {
          if (!state.calDragging) return;
          const touch = e.touches[0];
          const target = document.elementFromPoint(
            touch.clientX,
            touch.clientY,
          );
          if (
            target &&
            target.classList.contains("cal-day") &&
            target.dataset.date
          ) {
            if (state.calRangeEnd !== target.dataset.date) {
              state.calRangeEnd = target.dataset.date;
              renderCalendar();
              showTimeBar();
            }
          }
        },
        { passive: true },
      );
    }
    grid.appendChild(el);
  }
}

export function showTimeBar() {
  const area = document.getElementById("time-selection-area");
  const rangeMin = getCalRangeMin();
  const rangeMax = getCalRangeMax();
  if (!rangeMin) {
    area.style.display = "none";
    return;
  }
  area.style.display = "block";
  const dates = getDatesBetween(rangeMin, rangeMax);
  const { from: barFrom, to: barTo } = getTimeRange(
    state.meetingData.time_from,
    state.meetingData.time_to,
  );
  const label = document.getElementById("selected-date-label");
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  if (rangeMin === rangeMax) {
    const [, m, d] = rangeMin.split("-");
    const dow = dayNames[new Date(rangeMin + "T00:00:00").getDay()];
    label.textContent = `${parseInt(m)}월 ${parseInt(d)}일 (${dow}) 시간 선택`;
  } else {
    const [, m1, d1] = rangeMin.split("-");
    const [, m2, d2] = rangeMax.split("-");
    label.textContent = `${parseInt(m1)}월 ${parseInt(d1)}일 ~ ${parseInt(m2)}월 ${parseInt(d2)}일 시간 선택`;
  }
  const container = document.getElementById("time-bar-container");
  container.innerHTML = "";
  const slotCount = (barTo - barFrom) * 2;
  const labelsDiv = document.createElement("div");
  labelsDiv.className = "time-bar-labels";
  for (let h = barFrom; h <= barTo; h += 2) {
    const lbl = document.createElement("span");
    lbl.textContent = `${String(h).padStart(2, "0")}`;
    lbl.style.left = `${((h - barFrom) / (barTo - barFrom)) * 100}%`;
    labelsDiv.appendChild(lbl);
  }
  container.appendChild(labelsDiv);
  const track = document.createElement("div");
  track.className = "time-bar-track";
  for (let i = 0; i < slotCount; i++) {
    const slotValue = barFrom + i * 0.5;
    const seg = document.createElement("div");
    seg.className = "time-bar-seg";
    seg.dataset.slot = slotValue;
    if (i % 2 === 0) seg.classList.add("hour-start");
    const allHave = dates.every(
      (d) =>
        state.selectedSlots[d] && state.selectedSlots[d].includes(slotValue),
    );
    const someHave = dates.some(
      (d) =>
        state.selectedSlots[d] && state.selectedSlots[d].includes(slotValue),
    );
    if (allHave) seg.classList.add("selected");
    else if (someHave) seg.classList.add("partial");
    const startDrag = (slotVal) => {
      state.timeDragging = true;
      state.timeSelStart = slotVal;
      state.timeSelEnd = slotVal;
      const allHaveThis = dates.every(
        (d) =>
          state.selectedSlots[d] && state.selectedSlots[d].includes(slotVal),
      );
      state.timeSelMode = allHaveThis ? "remove" : "add";
      updateTimeBarHighlight();
    };
    seg.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startDrag(slotValue);
    });
    seg.addEventListener("mouseenter", () => {
      if (state.timeDragging) {
        state.timeSelEnd = slotValue;
        updateTimeBarHighlight();
      }
    });
    seg.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        startDrag(slotValue);
      },
      { passive: false },
    );
    track.appendChild(seg);
  }
  track.addEventListener(
    "touchmove",
    (e) => {
      if (!state.timeDragging) return;
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (
        target &&
        target.classList.contains("time-bar-seg") &&
        target.dataset.slot
      ) {
        const val = parseFloat(target.dataset.slot);
        if (state.timeSelEnd !== val) {
          state.timeSelEnd = val;
          updateTimeBarHighlight();
        }
      }
    },
    { passive: true },
  );
  container.appendChild(track);
  const hint = document.createElement("div");
  hint.className = "time-bar-hint";
  hint.textContent = "드래그하여 시간 범위를 선택하세요";
  container.appendChild(hint);
}

function updateTimeBarHighlight() {
  const track = document.querySelector(".time-bar-track");
  if (!track) return;
  const min = Math.min(state.timeSelStart, state.timeSelEnd);
  const max = Math.max(state.timeSelStart, state.timeSelEnd);
  track.querySelectorAll(".time-bar-seg").forEach((seg) => {
    const val = parseFloat(seg.dataset.slot);
    const inRange = val >= min && val <= max;
    seg.classList.toggle("dragging", inRange && state.timeSelMode === "add");
    seg.classList.toggle(
      "dragging-remove",
      inRange && state.timeSelMode === "remove",
    );
  });
  const hint = document.querySelector(".time-bar-hint");
  if (hint) {
    hint.textContent = `${formatSlotLabel(min)} ~ ${formatSlotLabel(max + 0.5)}`;
  }
}

export function applyTimeSelection() {
  if (state.timeSelStart === null || state.timeSelEnd === null) return;
  const min = Math.min(state.timeSelStart, state.timeSelEnd);
  const max = Math.max(state.timeSelStart, state.timeSelEnd);
  const rangeMin = getCalRangeMin();
  const rangeMax = getCalRangeMax();
  if (!rangeMin) return;
  const dates = getDatesBetween(rangeMin, rangeMax);
  for (const date of dates) {
    if (!state.selectedSlots[date]) state.selectedSlots[date] = [];
    const { from, to } = getTimeRange(
      state.meetingData.time_from,
      state.meetingData.time_to,
    );
    if (state.timeSelMode === "remove") {
      state.selectedSlots[date] = state.selectedSlots[date].filter(
        (s) => s < min || s > max || s < from || s >= to,
      );
    } else {
      for (let s = min; s <= max; s += 0.5) {
        if (s >= from && s < to && !state.selectedSlots[date].includes(s)) {
          state.selectedSlots[date].push(s);
        }
      }
      state.selectedSlots[date].sort((a, b) => a - b);
    }
  }
  state.timeSelStart = null;
  state.timeSelEnd = null;
  renderCalendar();
  showTimeBar();
}

export function clearSelectedDates() {
  const rangeMin = getCalRangeMin();
  const rangeMax = getCalRangeMax();
  if (!rangeMin) return;
  const dates = getDatesBetween(rangeMin, rangeMax);
  for (const d of dates) {
    state.selectedSlots[d] = [];
  }
  renderCalendar();
  showTimeBar();
}

export function selectAllTimes() {
  const rangeMin = getCalRangeMin();
  const rangeMax = getCalRangeMax();
  if (!rangeMin) return;
  const dates = getDatesBetween(rangeMin, rangeMax);
  for (const d of dates) {
    const { from, to } = getTimeRange(
      state.meetingData.time_from,
      state.meetingData.time_to,
    );
    state.selectedSlots[d] = [];
    for (let s = from; s < to; s += 0.5) {
      state.selectedSlots[d].push(s);
    }
  }
  renderCalendar();
  showTimeBar();
}
