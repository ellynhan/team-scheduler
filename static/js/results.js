import { state } from "./state.js";
import { apiFetch } from "./api.js";
import {
  formatSlotLabel,
  formatDateLabel,
  slotsToRanges,
  copyToClipboard,
} from "./utils.js";

export function buildCandidates(slotDetails, memberCount) {
  const candidates = [];
  for (const date of Object.keys(slotDetails).sort()) {
    const dateSlots = slotDetails[date];
    const slotValues = Object.keys(dateSlots)
      .map(Number)
      .sort((a, b) => a - b);
    let i = 0;
    while (i < slotValues.length) {
      const sv = slotValues[i];
      const members = dateSlots[String(sv)].slice().sort();
      const count = members.length;
      let j = i + 1;
      while (j < slotValues.length) {
        const nextSv = slotValues[j];
        const nextMembers = dateSlots[String(nextSv)].slice().sort();
        if (
          nextSv - slotValues[j - 1] <= 0.5 + 0.001 &&
          nextMembers.length === count &&
          members.every((m, idx) => m === nextMembers[idx])
        ) {
          j++;
        } else {
          break;
        }
      }
      candidates.push({
        count,
        date,
        from: sv,
        to: slotValues[j - 1] + 0.5,
        members,
      });
      i = j;
    }
  }
  candidates.sort(
    (a, b) =>
      b.count - a.count || a.date.localeCompare(b.date) || a.from - b.from,
  );
  return candidates;
}

export async function loadResults() {
  try {
    const data = await apiFetch(
      `/api/meetings/${state.currentMeetingId}/common`,
    );
    renderResults(data);
  } catch {
    /* ignore */
  }
}

function renderResults(data) {
  const area = document.getElementById("results-area");
  area.style.display = "block";
  const membersList = document.getElementById("members-list");
  membersList.innerHTML = "";
  if (data.members && data.members.length > 0) {
    data.members.forEach((m) => {
      const tag = document.createElement("span");
      tag.className = "member-tag";
      tag.textContent = m;
      membersList.appendChild(tag);
    });
  }
  const bannerDiv = document.getElementById("results-banner");
  bannerDiv.innerHTML = "";
  if (data.member_count === 0) {
    bannerDiv.innerHTML =
      '<div class="no-common">아직 아무도 가능 시간을 입력하지 않았습니다.</div>';
    document.getElementById("results-tabs").style.display = "none";
    return;
  }
  document.getElementById("results-tabs").style.display = "flex";
  const banner = document.createElement("div");
  if (data.member_count >= data.total_members) {
    banner.className = "all-submitted-banner";
    banner.textContent = `모든 멤버(${data.member_count}/${data.total_members}명)가 응답했습니다!`;
  } else {
    banner.className = "partial-banner";
    banner.textContent = `${data.member_count}/${data.total_members}명이 응답했습니다.`;
  }
  bannerDiv.appendChild(banner);
  const tabCommon = document.getElementById("tab-common");
  const tabCandidates = document.getElementById("tab-candidates");
  const tabIndividual = document.getElementById("tab-individual");
  tabCommon.innerHTML = "";
  tabCandidates.innerHTML = "";
  tabIndividual.innerHTML = "";
  renderCommonSection(tabCommon, data.common_slots);
  renderCandidateSection(
    tabCandidates,
    data.slot_details || {},
    data.member_count,
  );
  renderIndividualSection(tabIndividual, data.individual || []);
  initResultTabs();
}

function initResultTabs() {
  const tabs = document.querySelectorAll(".result-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.querySelectorAll(".tab-content").forEach((c) => {
        c.style.display = "none";
      });
      document.getElementById("tab-" + tab.dataset.tab).style.display = "block";
    });
  });
}

function renderCommonSection(container, commonSlots) {
  const sortedDates = Object.keys(commonSlots).sort();
  if (sortedDates.length === 0) {
    container.innerHTML =
      '<div class="no-common">모든 멤버가 공통으로 가능한 시간이 없습니다.</div>';
    return;
  }
  sortedDates.forEach((date) => {
    const card = document.createElement("div");
    card.className = "result-card";
    const dateLabel = document.createElement("div");
    dateLabel.className = "result-date";
    dateLabel.textContent = formatDateLabel(date);
    card.appendChild(dateLabel);
    const ranges = slotsToRanges(commonSlots[date]);
    const timesDiv = document.createElement("div");
    timesDiv.className = "result-times";
    ranges.forEach(([s, e]) => {
      const chip = document.createElement("span");
      chip.className = "result-time-chip";
      chip.textContent = `${formatSlotLabel(s)} ~ ${formatSlotLabel(e)}`;
      timesDiv.appendChild(chip);
    });
    card.appendChild(timesDiv);
    container.appendChild(card);
  });
}

function renderCandidateSection(container, slotDetails, memberCount) {
  if (Object.keys(slotDetails).length === 0) {
    container.innerHTML =
      '<div class="no-common">아직 데이터가 없습니다.</div>';
    return;
  }
  const candidates = buildCandidates(slotDetails, memberCount);
  if (candidates.length === 0) {
    container.innerHTML =
      '<div class="no-common">후보 시간대가 없습니다.</div>';
    return;
  }
  let currentCount = -1;
  let currentBody = null;
  candidates.forEach((c) => {
    if (c.count !== currentCount) {
      currentCount = c.count;
      const group = document.createElement("div");
      group.className = "candidate-group";
      const header = document.createElement("div");
      header.className = "candidate-count-header";
      if (c.count === memberCount) {
        header.classList.add("count-all");
        header.textContent = `${c.count}/${memberCount}명 가능 (전원)`;
      } else {
        header.textContent = `${c.count}/${memberCount}명 가능`;
      }
      header.addEventListener("click", () => {
        const body = header.nextElementSibling;
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        header.classList.toggle("collapsed", isOpen);
      });
      group.appendChild(header);
      currentBody = document.createElement("div");
      currentBody.className = "candidate-group-body";
      group.appendChild(currentBody);
      container.appendChild(group);
    }
    const card = document.createElement("div");
    card.className = "result-card candidate-card";
    const topRow = document.createElement("div");
    topRow.className = "candidate-top";
    const dateSpan = document.createElement("span");
    dateSpan.className = "candidate-date";
    dateSpan.textContent = formatDateLabel(c.date);
    topRow.appendChild(dateSpan);
    const timeChip = document.createElement("span");
    timeChip.className =
      c.count === memberCount
        ? "result-time-chip"
        : "result-time-chip candidate-chip";
    timeChip.textContent = `${formatSlotLabel(c.from)} ~ ${formatSlotLabel(c.to)}`;
    topRow.appendChild(timeChip);
    card.appendChild(topRow);
    if (c.count < memberCount) {
      const membersRow = document.createElement("div");
      membersRow.className = "candidate-members";
      c.members.forEach((name) => {
        const tag = document.createElement("span");
        tag.className = "member-tag";
        tag.textContent = name;
        membersRow.appendChild(tag);
      });
      card.appendChild(membersRow);
    }
    currentBody.appendChild(card);
  });
}

function renderIndividualSection(container, individual) {
  if (individual.length === 0) {
    container.innerHTML =
      '<div class="no-common">아직 아무도 가능 시간을 입력하지 않았습니다.</div>';
    return;
  }
  individual.forEach((person) => {
    const card = document.createElement("div");
    card.className = "result-card individual-card";
    const nameEl = document.createElement("div");
    nameEl.className = "individual-name";
    nameEl.textContent = person.name;
    card.appendChild(nameEl);
    const dates = Object.keys(person.slots).sort();
    if (dates.length === 0) {
      const empty = document.createElement("div");
      empty.className = "individual-empty";
      empty.textContent = "선택한 시간 없음";
      card.appendChild(empty);
    } else {
      dates.forEach((date) => {
        const row = document.createElement("div");
        row.className = "individual-row";
        const dateSpan = document.createElement("span");
        dateSpan.className = "individual-date";
        dateSpan.textContent = formatDateLabel(date);
        row.appendChild(dateSpan);
        const ranges = slotsToRanges(person.slots[date]);
        const timeSpan = document.createElement("span");
        timeSpan.className = "individual-time";
        timeSpan.textContent = ranges
          .map(([s, e]) => `${formatSlotLabel(s)}~${formatSlotLabel(e)}`)
          .join(", ");
        row.appendChild(timeSpan);
        card.appendChild(row);
      });
    }
    container.appendChild(card);
  });
}

export async function handleShareResults() {
  const btn = document.getElementById("share-results-btn");
  let data;
  try {
    data = await apiFetch(`/api/meetings/${state.currentMeetingId}/common`);
  } catch {
    alert("결과를 불러올 수 없습니다.");
    return;
  }
  if (data.member_count === 0) {
    alert("아직 응답한 사람이 없습니다.");
    return;
  }
  const md = state.meetingData;
  let text = `[${md.title}] 일정 조율 결과\n`;
  text += `기간: ${md.date_from} ~ ${md.date_to}\n`;
  text += `응답: ${data.member_count}/${data.total_members}명\n\n`;
  const commonDates = Object.keys(data.common_slots).sort();
  text += "■ 전체 공통시간\n";
  if (commonDates.length === 0) {
    text += " 없음\n";
  } else {
    commonDates.forEach((date) => {
      const ranges = slotsToRanges(data.common_slots[date]);
      const timeStr = ranges
        .map(([s, e]) => `${formatSlotLabel(s)}~${formatSlotLabel(e)}`)
        .join(", ");
      text += `${formatDateLabel(date)}: ${timeStr}\n`;
    });
  }
  text += "\n";
  const candidates = buildCandidates(
    data.slot_details || {},
    data.member_count,
  );
  const topCount = candidates.length > 0 ? candidates[0].count : 0;
  if (topCount > 0 && topCount < data.member_count) {
    const topCandidates = candidates.filter((c) => c.count === topCount);
    text += `■ 최다 후보시간대 (${topCount}/${data.member_count}명 가능)\n`;
    topCandidates.forEach((c) => {
      text += `${formatDateLabel(c.date)}: ${formatSlotLabel(c.from)}~${formatSlotLabel(c.to)} [${c.members.join(", ")}]\n`;
    });
    text += "\n";
  }
  const respondedNames = data.members || [];
  const presetMembers = md.preset_members;
  if (presetMembers && presetMembers.length > 0) {
    const notResponded = presetMembers.filter(
      (m) => !respondedNames.includes(m),
    );
    text += "■ 미응답자\n";
    text +=
      notResponded.length === 0
        ? " 없음 (전원 응답)\n"
        : `${notResponded.join(", ")}\n`;
  } else if (data.member_count < data.total_members) {
    text += `■ 미응답\n ${data.total_members - data.member_count}명 미응답\n`;
  }
  copyToClipboard(text, btn);
}
