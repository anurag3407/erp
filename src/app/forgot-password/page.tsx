"use client";

import React, { useState } from "react";
import { GraduationCap, MailCheck } from "lucide-react";
import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setDevToken(null);
    setSubmitting(true);
    try {
      const res = await requestPasswordReset(email);
      if (!res.success) {
        setError(res.error || "Request failed");
        return;
      }
      setMessage(res.data?.message || "If that account exists, a reset link has been sent.");
      if (res.data?.developmentResetToken) {
        setDevToken(res.data.developmentResetToken as string);
      }
    } catch {
      setError("Request failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Reset your password</h1>
            <p className="text-xs text-slate-500">We&apos;ll send a reset link</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@enterprise-college.edu"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {message && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              <MailCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p>{message}</p>
                {devToken && (
                  <a
                    className="mt-1 inline-block text-xs font-semibold text-indigo-600 underline break-all"
                    href={`/reset-password?token=${encodeURIComponent(devToken)}`}
                  >
                    Development reset link
                  </a>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-indigo-600 text-white text-sm font-semibold py-2.5 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-xs text-slate-400 text-center">
          <a className="text-indigo-600 hover:underline" href="/login">
            Back to sign in
          </a>
        </p>
      </div>
    </div>
  );
}
