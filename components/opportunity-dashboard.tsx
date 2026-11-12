"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PortalShell, api, browserTimezone } from "@/components/portal-shell";
import type { OpportunityRun, OpportunitySettings } from "@/lib/opportunity-types";

type DashboardData = {
  settings: OpportunitySettings;
  settings_saved: boolean;
  local_date: string;
  run: OpportunityRun | null;
  is_today: boolean;
  refreshed_run: OpportunityRun | null;
};

const COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];

function timezoneOptions(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const list = intl.supportedValuesOf ? intl.supportedValuesOf("timeZone") : [];
  return Array.from(new Set([current, ...list]));
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 === 0 ? 12 : hour % 12}${suffix}`;
}

export function OpportunityDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [draft, setDraft] = useState<OpportunitySettings | null>(null);
  const [busy, setBusy] = useState<"" | "load" | "refresh" | "save">("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState<"daily" | "refreshed">("daily");
  const tz = typeof window === "undefined" ? "UTC" : browserTimezone();

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api<DashboardData>(`/api/v1/opportunities?tz=${encodeURIComponent(tz)}`);
      setData(result);
      setDraft(result.settings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load opportunities");
    } finally {
      setBusy("");
    }
  }, [tz]);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setBusy("refresh");
    setError("");
    setNotice("");
    try {
      const result = await api<DashboardData>(`/api/v1/opportunities?tz=${encodeURIComponent(tz)}`, { method: "POST" });
      setData(result);
      setView("refreshed");
      setNotice("Refreshed from current profiles and rates. Your 8am list is kept under its own tab.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not regenerate");
    } finally {
      setBusy("");
    }
  }

  async function saveSettings() {
    if (!draft) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      await api("/api/v1/opportunity-settings", { method: "PUT", body: JSON.stringify(draft) });
      await load();
      setNotice(`Saved. ${draft.daily_count} opportunities will be generated each day at ${hourLabel(draft.generation_hour)} ${draft.timezone} time.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings");
    } finally {
      setBusy("");
    }
  }

  const dailyRun = data?.run ?? null;
  const refreshedRun = data?.refreshed_run ?? null;
  const run = (view === "refreshed" || !dailyRun) && refreshedRun ? refreshedRun : dailyRun;
  const showingRefresh = run !== null && run === refreshedRun;
  const settingsChanged =
    !!draft && !!data && (!data.settings_saved || JSON.stringify(draft) !== JSON.stringify(data.settings));

  return (
    <PortalShell title="Dashboard" kicker="FOUNDRY FX / SALES">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section className="panel" aria-labelledby="opp-title">
        <div className="opp-titlebar">
          <button
            type="button"
            className={`opp-chevron${collapsed ? " is-collapsed" : ""}`}
            aria-expanded={!collapsed}
            aria-controls="opp-body"
            aria-label={collapsed ? "Expand AI trade opportunities" : "Collapse AI trade opportunities"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <h2 id="opp-title">AI TRADE OPPORTUNITIES</h2>
          {run && <span className="count-badge">{run.items.length} <span>today</span></span>}
          <span className="opp-titlebar-actions">
            <button type="button" className="icon-btn" disabled={busy !== ""} onClick={() => void refresh()} title="Regenerate now" aria-label="Regenerate now">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4.9 9a7.5 7.5 0 0 1 12.4-2L20 12M4 17v-5h5" /><path d="M19.1 15a7.5 7.5 0 0 1-12.4 2L4 12" /></svg>
            </button>
            <button type="button" className={`icon-btn${showSettings || !data?.settings_saved ? " on" : ""}`} onClick={() => setShowSettings(!showSettings)} title="Daily generation settings" aria-label="Daily generation settings" aria-expanded={showSettings}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>
            </button>
          </span>
        </div>

        <div id="opp-body" hidden={collapsed}>
        <div className="panel-head">
          <div>
            <p className="panel-sub">
              Each box is calculated from the client profile and live rates. Hover a box for the numbers behind it.
              {run && (
                <> {showingRefresh ? "Refreshed" : "Generated"} {new Date(run.generated_at).toLocaleString()}{!showingRefresh && !data?.is_today && " · this is the previous daily list; today's is generated at the scheduled hour"}.</>
              )}
            </p>
            {refreshedRun && (
              <div className="segmented" role="tablist" aria-label="Which list to show" style={{ marginTop: 10 }}>
                <button type="button" role="tab" aria-selected={!showingRefresh} className={!showingRefresh ? "on" : ""} onClick={() => setView("daily")} disabled={!dailyRun}>
                  {dailyRun?.run_date === data?.local_date ? "Today's daily list" : "Last daily list"}
                </button>
                <button type="button" role="tab" aria-selected={showingRefresh} className={showingRefresh ? "on" : ""} onClick={() => setView("refreshed")}>
                  Refreshed {new Date(refreshedRun.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </button>
              </div>
            )}
          </div>
          {draft && (showSettings || !data?.settings_saved) && (
            <div className="opp-controls">
              <label className="mini-field">
                PER DAY
                <select value={draft.daily_count} onChange={(event) => setDraft({ ...draft, daily_count: Number(event.target.value) })}>
                  {COUNTS.map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
              </label>
              <label className="mini-field">
                RUN AT
                <select value={draft.generation_hour} onChange={(event) => setDraft({ ...draft, generation_hour: Number(event.target.value) })}>
                  {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
                </select>
              </label>
              <label className="mini-field">
                MY TIMEZONE
                <select value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })}>
                  {timezoneOptions(draft.timezone).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </label>
              {(settingsChanged || !data?.settings_saved) && (
                <button className="button button-primary" disabled={busy !== ""} onClick={() => void saveSettings()}>
                  {busy === "save" ? "Saving…" : data?.settings_saved ? "Save" : "Save schedule"}
                </button>
              )}
            </div>
          )}
        </div>

        {busy === "refresh" && <p className="spinner-line">Generating from current profiles and live rates…</p>}
        {busy === "load" && <p className="spinner-line">Loading today&apos;s opportunities…</p>}
        {busy === "" && run && run.items.length > 0 && (
          <ol className="opp-list">
            {run.items.map((item, index) => (
              <li key={`${item.client_id}-${item.exposure_id}`} className="opp-row">
                <span className="opp-rank" aria-hidden="true">{index + 1}</span>
                <div className="opp-client">
                  <strong><span className="sr-only">{index + 1} - </span>{item.client_name}:</strong>
                  <small>{item.exposure_label} · {item.currency_pair}</small>
                </div>
                <div className="reason-chips">
                  {item.reasons.map((reason) => (
                    <span key={reason.kind} className={`reason-chip tone-${reason.tone}`} tabIndex={0}>
                      {reason.title}
                      <span className="tip" role="tooltip">{reason.detail}</span>
                    </span>
                  ))}
                </div>
                <div className="opp-actions">
                  <Link
                    className="button button-primary"
                    href={`/deal-builder?client=${encodeURIComponent(item.client_id)}&exposure=${encodeURIComponent(item.exposure_id)}&generate=1`}
                  >
                    AI Generate
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
        {busy !== "load" && (!run || run.items.length === 0) && (
          <div className="opp-empty">
            {run
              ? "No opportunities met the criteria. Check that client exposures have budget rates, hedged amounts and hedging policy filled in."
              : `Today's opportunities are generated at ${hourLabel(draft?.generation_hour ?? 8)} your time.`}{" "}
            <Link href="/clients">Manage client profiles →</Link>
          </div>
        )}
        {run && run.warnings.length > 0 && (
          <ul className="warning-list">{run.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        )}
        </div>
      </section>

      {run && run.market.length > 0 && (
        <section className="panel">
          <p className="section-kicker">RATES USED IN THIS RUN</p>
          <div className="facts-grid" style={{ marginTop: 10 }}>
            {run.market.map((fact) => (
              <div key={fact.currency_pair} className="fact">
                <strong>{fact.currency_pair} {fact.spot}</strong>
                {fact.source} · {fact.as_of}
                {fact.week52_low !== null && fact.week52_high !== null && <><br />52-week {fact.week52_low} to {fact.week52_high}</>}
              </div>
            ))}
          </div>
          <p className="panel-sub small">Reference observations only. They are not executable or forward prices.</p>
        </section>
      )}
    </PortalShell>
  );
}
