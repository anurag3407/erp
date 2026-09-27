"use client";

import React, { useCallback, useEffect, useState } from "react";
import { GraduationCap, UserPlus, RefreshCw, ShieldAlert, CheckCircle2 } from "lucide-react";
import { createUser, listUsers } from "../../actions";

const ROLES = [
  "SUPER_ADMIN",
  "REGISTRAR",
  "DEAN",
  "HOD",
  "FACULTY",
  "STUDENT",
  "PARENT",
  "COE",
  "FINANCE_OFFICER",
  "LIBRARIAN",
  "WARDEN",
  "MENTOR",
];

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  departmentId: string | null;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "STUDENT",
    departmentId: "",
    password: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; generatedPassword?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await listUsers();
      if (!res.success) {
        setPageError(res.error || "Failed to load users");
        setUsers([]);
        return;
      }
      setUsers(res.data as UserRow[]);
    } catch {
      setPageError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCreated(null);
    setSubmitting(true);
    try {
      const res = await createUser({
        name: form.name,
        email: form.email,
        role: form.role,
        departmentId: form.departmentId || undefined,
        password: form.password || undefined,
      });
      if (!res.success) {
        setFormError(res.error || "Failed to create user");
        return;
      }
      setCreated({
        email: res.data.email,
        generatedPassword: res.data.generatedPassword,
      });
      setForm({ name: "", email: "", role: "STUDENT", departmentId: "", password: "" });
      await load();
    } catch {
      setFormError("Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">User Provisioning</h1>
            <p className="text-xs text-slate-500">Create institutional accounts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-100"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <a
            href="/"
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Back to dashboard
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {pageError && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{pageError}</span>
          </div>
        )}

        {/* Provision form */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <UserPlus className="w-4 h-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-800">New account</h2>
          </div>

          <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Jane Doe"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="jane.doe@enterprise-college.edu"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Department ID <span className="text-slate-400">(optional)</span>
              </label>
              <input
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="dept-cse"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Initial password <span className="text-slate-400">(leave blank to auto-generate)</span>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Min 12 chars — mixed case, number & symbol"
              />
            </div>

            {formError && (
              <div className="md:col-span-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}

            {created && (
              <div className="md:col-span-2 flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p>Account created for {created.email}.</p>
                  {created.generatedPassword && (
                    <p className="mt-1">
                      Temporary password (shown once):{" "}
                      <code className="font-mono font-semibold">{created.generatedPassword}</code>
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        </section>

        {/* User list */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Existing accounts</h2>
            <span className="text-xs text-slate-500">{users.length} total</span>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-6 py-3">Name</th>
                  <th className="text-left font-medium px-6 py-3">Email</th>
                  <th className="text-left font-medium px-6 py-3">Role</th>
                  <th className="text-left font-medium px-6 py-3">Department</th>
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
                {!loading && users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-6 text-center text-slate-400">
                      No accounts to display.
                    </td>
                  </tr>
                )}
                {!loading &&
                  users.map((u) => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-6 py-3 font-medium text-slate-800">{u.name}</td>
                      <td className="px-6 py-3 text-slate-600">{u.email}</td>
                      <td className="px-6 py-3">
                        <span className="inline-block rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-500">{u.departmentId || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
