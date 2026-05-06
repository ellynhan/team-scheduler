import { state } from "./state.js";
import { createComboSearch } from "./combo-search.js";
import {
  initTimeSelects,
  initDateDefaults,
  handleCreate,
} from "./meeting-form.js";
import {
  checkRoute,
  goHome,
  handleSubmit,
  handleCopy,
  loadMeeting,
} from "./meeting-view.js";
import {
  loadInitData,
  loadMeetingList,
  deleteMeeting,
  renderMeetingList,
} from "./meeting-list.js";
import { handleShareResults } from "./results.js";
import {
  navigateMonth,
  clearSelectedDates,
  selectAllTimes,
  applyTimeSelection,
} from "./calendar.js";
import {
  openGroupManage,
  closeGroupManage,
  saveGroup,
  cancelGroupEdit,
  filterGroupList,
} from "./groups.js";
document.addEventListener("DOMContentLoaded", () => {
  initTimeSelects();
  initDateDefaults();
  const groupCombo = createComboSearch({
    inputId: "group-search",
    dropdownId: "group-search-results",
    tagId: "selected-group-display",
    tagNameId: "selected-group-name",
    clearBtnId: "clear-group-btn",
    getItems: () => state.allGroups,
    minQuery: 3,
    onSelect: (g) => {
      state.selectedGroupId = g.id;
      document.getElementById("preset-members").value = g.members.join(", ");
    },
    onClear: () => {
      state.selectedGroupId = null;
      document.getElementById("preset-members").value = "";
    },
  });
  const meetingFilterCombo = createComboSearch({
    inputId: "meeting-group-filter",
    dropdownId: "meeting-group-filter-results",
    tagId: "meeting-filter-tag",
    tagNameId: "meeting-filter-tag-name",
    clearBtnId: "clear-meeting-filter",
    getItems: () => state.allGroups,
    minQuery: 2,
    onSelect: (g) => {
      state.meetingFilterGroupId = g.id;
      renderMeetingList(state.cachedMeetings, state.allGroups);
    },
    onClear: () => {
      state.meetingFilterGroupId = null;
      renderMeetingList(state.cachedMeetings, state.allGroups);
    },
  });
  document
    .getElementById("create-form")
    .addEventListener("submit", handleCreate);
  document
    .getElementById("prev-month")
    .addEventListener("click", () => navigateMonth(-1));
  document
    .getElementById("next-month")
    .addEventListener("click", () => navigateMonth(1));
  document.getElementById("submit-btn").addEventListener("click", handleSubmit);
  document.getElementById("copy-btn").addEventListener("click", handleCopy);
  document
    .getElementById("clear-times")
    .addEventListener("click", clearSelectedDates);
  document
    .getElementById("select-all-times")
    .addEventListener("click", selectAllTimes);
  document.getElementById("back-btn").addEventListener("click", goHome);
  document
    .getElementById("delete-meeting-btn")
    .addEventListener("click", () => {
      if (state.currentMeetingId && state.meetingData) {
        deleteMeeting(state.currentMeetingId, state.meetingData.title);
      }
    });
  document
    .getElementById("manage-groups-btn")
    .addEventListener("click", openGroupManage);
  document
    .getElementById("close-groups-btn")
    .addEventListener("click", closeGroupManage);
  document
    .getElementById("save-group-btn")
    .addEventListener("click", saveGroup);
  document
    .getElementById("cancel-group-btn")
    .addEventListener("click", cancelGroupEdit);
  document
    .getElementById("share-results-btn")
    .addEventListener("click", handleShareResults);
  document
    .getElementById("group-list-search")
    .addEventListener("input", filterGroupList);
  document.getElementById("toggle-detail-btn").addEventListener("click", () => {
    const fields = document.getElementById("detail-fields");
    const btn = document.getElementById("toggle-detail-btn");
    const showing = fields.style.display === "none";
    fields.style.display = showing ? "block" : "none";
    btn.textContent = showing ? "- 상세 정보 접기" : "+ 상세 정보 추가";
  });
  document.querySelectorAll(".member-mode-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".member-mode-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("mode-count").style.display =
        tab.dataset.mode === "count" ? "block" : "none";
      document.getElementById("mode-names").style.display =
        tab.dataset.mode === "names" ? "block" : "none";
    });
  });
  document.addEventListener("mouseup", () => {
    if (state.calDragging) state.calDragging = false;
    if (state.timeDragging) {
      state.timeDragging = false;
      applyTimeSelection();
    }
  });
  document.addEventListener("touchend", () => {
    if (state.calDragging) state.calDragging = false;
    if (state.timeDragging) {
      state.timeDragging = false;
      applyTimeSelection();
    }
  });
  checkRoute();
  loadInitData();
});
