import { state } from "./state.js";
import { apiFetch, apiPost, apiPut } from "./api.js";

export function openGroupManage() {
  document.getElementById("group-manage-section").style.display = "block";
  loadGroupList();
}

export function closeGroupManage() {
  document.getElementById("group-manage-section").style.display = "none";
  cancelGroupEdit();
}

async function refreshGroups() {
  try {
    state.allGroups = await apiFetch("/api/groups");
  } catch {
    /* ignore */
  }
}

async function loadGroupList() {
  await refreshGroups();
  renderGroupListCards(state.allGroups);
}

function renderGroupListCards(groups) {
  const container = document.getElementById("group-list");
  container.innerHTML = "";
  if (groups.length === 0) {
    container.innerHTML =
      '<div class="no-common">저장된 그룹이 없습니다.</div>';
    return;
  }
  groups.forEach((g) => {
    const card = document.createElement("div");
    card.className = "group-card";
    const top = document.createElement("div");
    top.className = "group-card-top";
    const name = document.createElement("span");
    name.className = "group-card-name";
    name.textContent = `${g.name} (${g.members.length}명)`;
    top.appendChild(name);
    const actions = document.createElement("div");
    actions.className = "group-card-actions";
    const editBtn = document.createElement("button");
    editBtn.className = "btn-secondary btn-sm";
    editBtn.textContent = "수정";
    editBtn.addEventListener("click", () => startEditGroup(g));
    actions.appendChild(editBtn);
    const delBtn = document.createElement("button");
    delBtn.className = "btn-delete-small";
    delBtn.style.opacity = "1";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => deleteGroup(g.id, g.name));
    actions.appendChild(delBtn);
    top.appendChild(actions);
    card.appendChild(top);
    const members = document.createElement("div");
    members.className = "group-card-members";
    members.textContent = g.members.join(", ");
    card.appendChild(members);
    container.appendChild(card);
  });
}

export function filterGroupList() {
  const query = document
    .getElementById("group-list-search")
    .value.trim()
    .toLowerCase();
  if (!query) {
    renderGroupListCards(state.allGroups);
    return;
  }
  const filtered = state.allGroups.filter(
    (g) =>
      g.name.toLowerCase().includes(query) ||
      g.members.some((m) => m.toLowerCase().includes(query)),
  );
  renderGroupListCards(filtered);
}

function startEditGroup(group) {
  const password = prompt("그룹 비밀번호를 입력하세요:");
  if (password === null) return;
  state.editingGroupId = group.id;
  state.editingGroupPassword = password;
  document.getElementById("group-name").value = group.name;
  document.getElementById("group-members-input").value =
    group.members.join(", ");
  document.getElementById("group-password").value = "";
  document.getElementById("group-password").style.display = "none";
  document.getElementById("save-group-btn").textContent = "수정 저장";
  document.getElementById("cancel-group-btn").style.display = "inline-block";
}

export function cancelGroupEdit() {
  state.editingGroupId = null;
  state.editingGroupPassword = null;
  document.getElementById("group-name").value = "";
  document.getElementById("group-members-input").value = "";
  document.getElementById("group-password").value = "";
  document.getElementById("group-password").style.display = "";
  document.getElementById("save-group-btn").textContent = "저장";
  document.getElementById("cancel-group-btn").style.display = "none";
}

export async function saveGroup() {
  const name = document.getElementById("group-name").value.trim();
  const membersRaw = document
    .getElementById("group-members-input")
    .value.trim();
  const members = membersRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s);
  if (!name) {
    alert("그룹 이름을 입력해주세요.");
    return;
  }
  if (members.length < 2) {
    alert("멤버는 2명 이상 입력해주세요.");
    return;
  }
  try {
    if (state.editingGroupId) {
      await apiPut(`/api/groups/${state.editingGroupId}`, {
        name,
        members,
        password: state.editingGroupPassword || "",
      });
    } else {
      const password = document.getElementById("group-password").value.trim();
      if (!password || !password.match(/^\d{4,8}$/)) {
        alert("비밀번호는 숫자 4~8자리로 입력해주세요.");
        return;
      }
      await apiPost("/api/groups", { name, members, password });
    }
    cancelGroupEdit();
    loadGroupList();
  } catch (e) {
    alert(e.message || "저장 실패");
  }
}

async function deleteGroup(id, name) {
  const password = prompt(`"${name}" 그룹을 삭제하려면 비밀번호를 입력하세요:`);
  if (password === null) return;
  try {
    await apiPost(`/api/groups/${id}/delete`, { password });
    loadGroupList();
  } catch (e) {
    alert(e.message || "삭제 실패");
  }
}
