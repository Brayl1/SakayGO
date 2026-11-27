import { useState } from "react";
const key = "sakaygo-admin-access";
export function adminFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = sessionStorage.getItem(key);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
export function AdminAccess({ onSuccess }: { onSuccess: () => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="form-grid"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/session", {
            headers: { Authorization: `Bearer ${token.trim()}` },
            cache: "no-store",
          });
          if (!response.ok || !(await response.json()).admin)
            throw new Error(
              "Access key was not accepted. Check the key and server configuration.",
            );
          sessionStorage.setItem(key, token.trim());
          window.dispatchEvent(new Event("sakaygo-session"));
          onSuccess();
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="wide">
        Administrator access key
        <input
          type="password"
          autoComplete="current-password"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy}>
        {busy ? "Signing in..." : "Unlock administration"}
      </button>
      <p>
        The key is configured as SAKAYGO_ADMIN_TOKEN on your server and stays in
        this browser tab until it closes.
      </p>
    </form>
  );
}

export function AdminSignOut() {
  if (!sessionStorage.getItem(key)) return null;
  return (
    <button
      className="secondary"
      onClick={() => {
        sessionStorage.removeItem(key);
        window.location.assign("/admin");
      }}
    >
      Sign out
    </button>
  );
}
