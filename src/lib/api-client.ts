/**
 * 前端 API 客戶端 — 自動附加 JWT Authorization header
 */

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("authToken");
}

export function setAuthToken(token: string): void {
  sessionStorage.setItem("authToken", token);
}

export function clearAuthToken(): void {
  sessionStorage.removeItem("authToken");
}

/**
 * 帶認證的 fetch — 自動附加 Authorization header
 */
export function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...options, headers });
}
