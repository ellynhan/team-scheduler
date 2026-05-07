export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatSlotLabel(value) {
  const h = Math.floor(value);
  const m = value % 1 >= 0.5 ? "30" : "00";
  return `${String(h).padStart(2, "0")}:${m}`;
}

export function formatDateLabel(dateStr) {
  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const [, m, d] = dateStr.split("-");
  const dow = dayNames[new Date(dateStr + "T00:00:00").getDay()];
  return `${parseInt(m)}월 ${parseInt(d)}일 (${dow})`;
}

export function slotsToRanges(slots) {
  if (!slots || slots.length === 0) return [];
  const sorted = [...slots].sort((a, b) => a - b);
  const ranges = [];
  let rStart = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - prev > 0.5 + 0.001) {
      ranges.push([rStart, prev + 0.5]);
      rStart = sorted[i];
    }
    prev = sorted[i];
  }
  ranges.push([rStart, prev + 0.5]);
  return ranges;
}

export function getDatesBetween(start, end) {
  const dates = [];
  let current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (current <= endDate) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export function getTimeRange(from, to) {
  return { from, to };
}

export function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    text.substring(0, idx) +
    '<span class="group-search-item-match">' +
    text.substring(idx, idx + query.length) +
    "</span>" +
    text.substring(idx + query.length)
  );
}

export function copyToClipboard(text, btn) {
  const originalText = btn.textContent;
  const onSuccess = () => {
    btn.textContent = "복사됨!";
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(onSuccess)
      .catch(() => {
        fallbackCopy(text);
        onSuccess();
      });
  } else {
    fallbackCopy(text);
    onSuccess();
  }
}

function fallbackCopy(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}
