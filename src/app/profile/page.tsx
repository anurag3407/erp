"use client";

import React, { useCallback, useEffect, useState } from "react";
import { GraduationCap, KeyRound, MonitorSmartphone, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import {
  getCurrentUser,
  getMySessions,
  changePassword,
  revokeSession,
  revokeOtherSessions,
} from "../actions";

interface SessionRow {
  key: string;
  createdAt: number;
  lastSeenAt: number;
  current: boolean;
}

function formatTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export default function ProfilePage() {
  const [user, setUser] = useState<{ userId: string; role: string; name: string; email: string } | null>(
    null
  );
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showBanner = (type: "success" | "error", text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await getCurrentUser();
      if (!me.success) {
        window.location.href = "/login";
        return;
      }
      setUser(me.data);
      const list = await getMySessions();
      if (list.success) setSessions(list.data as SessionRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (form.next !== form.confirm) {
      setPwError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await changePassword(form.current, form.next);
      if (!res.success) {
        setPwError(res.error || "Failed to change password");
        return;
      }
      showBanner("success", "Password updated. All sessions were signed out — redirecting…");
      setForm({ current: "", next: "", confirm: "" });
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch {
      setPwError("Failed to change password");
    } finally {
      setSubmitting(false);
    }
  };

  const onRevoke = async (key: string) => {
    const res = await revokeSession(key);
    if (!res.success) {
      showBanner("error", res.error || "Failed to revoke session");
      return;
    }
    if (res.data?.revokedCurrent) {
      window.location.href = "/login";
      return;
    }
    showBanner("success", "Session revoked.");
    await load();
  };

  const onRevokeOthers = async () => {
    const res = await revokeOtherSessions();
    if (!res.success) {
      showBanner("error", res.error || "Failed to revoke sessions");
      return;
    }
    showBanner("success", `Signed out ${res.data?.revokedCount ?? 0} other session(s).`);
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">My Profile</h1>
            <p className="text-xs text-slate-500">
              {user ? `${user.name} · ${user.role}` : "Loading…"}
            </p>
          </div>
        </div>
        <a href="/" className="text-xs font-medium text-indigo-600 hover:underline">
          Back to dashboard
        </a>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {banner && (
          <div
            className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
              banner.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{banner.text}</span>
          </div>
        )}

        {/* Change password */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-800">Change password</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Changing your password signs out every session, including this one.
          </p>

          <form onSubmit={onSubmitPassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Current password</label>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={form.current}
                onChange={(e) => setForm({ ...form, current: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New password</label>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.next}
                onChange={(e) => setForm({ ...form, next: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min 12 chars, mixed case, number & symbol"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirm new</label>
              <input
                required
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {pwError && (
              <div className="md:col-span-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {pwError}
              </div>
            )}

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </section>

        {/* Active sessions */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="w-4 h-4 text-indigo-600" />
              <h2 className="text-sm font-semibold text-slate-800">Active sessions</h2>
            </div>
            <button
              onClick={onRevokeOthers}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-100"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out other sessions
            </button>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-medium px-6 py-3">Session</th>
                <th className="text-left font-medium px-6 py-3">Signed in</th>
                <th className="text-left font-medium px-6 py-3">Last active</th>
                <th className="text-right font-medium px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading &&
                sessions.map((s) => (
                  <tr key={s.key} className="border-t border-slate-100">
                    <td className="px-6 py-3">
                      <span className="font-mono text-xs text-slate-500">{s.key.slice(0, 12)}…</span>
                      {s.current && (
                        <span className="ml-2 inline-block rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 uppercase">
                          This device
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{formatTime(s.createdAt)}</td>
                    <td className="px-6 py-3 text-slate-600">{formatTime(s.lastSeenAt)}</td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={() => onRevoke(s.key)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-800 px-2 py-1 rounded-md hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {s.current ? "Sign out" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                ))}
              {!loading && sessions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-6 text-center text-slate-400">
                    No active sessions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
