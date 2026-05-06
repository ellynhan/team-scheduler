export const BASE_PATH = window.location.pathname
  .replace(/\/meeting\/[^/]+$/, "")
  .replace(/\/$/, "");
const API = BASE_PATH;

export async function apiFetch(url, options = {}) {
  const res = await fetch(`${API}${url}`, options);
  const data = await res.json();
  if (!res.ok) {
    const msg =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail);
    throw new Error(msg || "요청 실패");
  }
  return data;
}

export function apiPost(url, body) {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiPut(url, body) {
  return apiFetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function apiDelete(url) {
  return apiFetch(url, { method: "DELETE" });
}
