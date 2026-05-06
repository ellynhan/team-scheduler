import { highlightMatch } from "./utils.js";

export function createComboSearch({
  inputId,
  dropdownId,
  tagId,
  tagNameId,
  clearBtnId,
  getItems,
  onSelect,
  onClear,
  minQuery = 2,
}) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  const tag = tagId ? document.getElementById(tagId) : null;
  const tagName = tagNameId ? document.getElementById(tagNameId) : null;
  const clearBtn = clearBtnId ? document.getElementById(clearBtnId) : null;
  let selectedId = null;

  function renderDropdown(groups, query) {
    dropdown.innerHTML = "";
    if (groups.length === 0) {
      dropdown.innerHTML =
        '<div class="group-search-empty">검색 결과 없음</div>';
      dropdown.style.display = "block";
      return;
    }
    groups.forEach((g) => {
      const item = document.createElement("div");
      item.className = "group-search-item";
      const nameEl = document.createElement("div");
      nameEl.className = "group-search-item-name";
      nameEl.innerHTML = query ? highlightMatch(g.name, query) : g.name;
      const membersEl = document.createElement("div");
      membersEl.className = "group-search-item-members";
      membersEl.innerHTML = query
        ? g.members.map((m) => highlightMatch(m, query)).join(", ")
        : g.members.join(", ");
      item.appendChild(nameEl);
      item.appendChild(membersEl);
      item.addEventListener("click", () => {
        selectedId = g.id;
        input.value = "";
        dropdown.style.display = "none";
        if (tag && tagName) {
          tagName.textContent = `${g.name} (${g.members.length}명)`;
          tag.style.display = "inline-flex";
          input.style.display = "none";
        }
        onSelect(g);
      });
      dropdown.appendChild(item);
    });
    dropdown.style.display = "block";
  }

  function filter() {
    const query = input.value.trim().toLowerCase();
    const items = getItems();
    if (query.length < minQuery) {
      renderDropdown(items, "");
      return;
    }
    const filtered = items.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.members.some((m) => m.toLowerCase().includes(query)),
    );
    renderDropdown(filtered, query);
  }

  function clear() {
    selectedId = null;
    input.value = "";
    input.style.display = "";
    if (tag) tag.style.display = "none";
    dropdown.style.display = "none";
    if (onClear) onClear();
  }

  input.addEventListener("focus", filter);
  input.addEventListener("input", filter);
  if (clearBtn) clearBtn.addEventListener("click", clear);
  document.addEventListener("click", (e) => {
    if (
      !e.target.closest(`#${inputId}`) &&
      !e.target.closest(`#${dropdownId}`)
    ) {
      dropdown.style.display = "none";
    }
  });

  return {
    getSelectedId: () => selectedId,
    setSelectedId: (id) => {
      selectedId = id;
    },
    clear,
  };
}
