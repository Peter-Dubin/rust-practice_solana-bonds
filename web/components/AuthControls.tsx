"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export function AuthControls({ userName }: { userName: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState<Mode | null>(null);
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(mode: Mode) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Request failed");
        return;
      }
      if (mode === "register") {
        // Auto-login after register.
        await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user, password }),
        });
      }
      setOpen(null);
      setUser("");
      setPassword("");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  if (userName) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-emerald-400">{userName}</span>
        <button
          onClick={logout}
          className="rounded bg-zinc-700 px-3 py-1 text-sm hover:bg-zinc-600"
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOpen("login")}
        className="rounded bg-zinc-700 px-3 py-1 text-sm hover:bg-zinc-600"
      >
        Login
      </button>
      <button
        onClick={() => setOpen("register")}
        className="rounded bg-emerald-600 px-3 py-1 text-sm hover:bg-emerald-500"
      >
        Register
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(null)}
        >
          <div
            className="w-80 rounded-lg bg-zinc-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold capitalize">{open}</h2>
            <input
              className="mb-2 w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none"
              placeholder="Username"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
            <input
              type="password"
              className="mb-3 w-full rounded bg-zinc-800 px-3 py-2 text-sm outline-none"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
            <button
              disabled={busy}
              onClick={() => submit(open)}
              className="w-full rounded bg-emerald-600 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "…" : open === "login" ? "Login" : "Create account"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
