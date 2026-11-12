"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalShell, api, browserTimezone } from "@/components/portal-shell";
import { RISK_BUCKETS, type ClientProfile, type DealSuggestion, type RiskBucket } from "@/lib/opportunity-types";
import type { Pitch, TradeParameters } from "@/lib/types";

type CatalogProduct = {
  name: string;
  classification: string;
  requirements: { rates: string[]; target: boolean; barrier: boolean; lev: boolean };
};

const BUCKET_BLURB: Record<RiskBucket, string> = {
  conservative: "Protection first. Certainty of outcome.",
  balanced: "Protection with room to participate.",
  dynamic: "Enhanced outcomes with conditional terms.",
};

function label(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inputsFor(product: CatalogProduct | undefined, previous: Record<string, string | null>): Record<string, string | null> {
  if (!product) return {};
  const keys = [...product.requirements.rates, ...(product.requirements.target ? ["target"] : []), ...(product.requirements.lev ? ["lev"] : [])];
  return Object.fromEntries(keys.map((key) => [key, previous[key] ?? null]));
}

export function DealBuilder({ initialClient, initialExposure, autoGenerate }: { initialClient: string | null; initialExposure: string | null; autoGenerate: boolean }) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [flagged, setFlagged] = useState<string[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [clientId, setClientId] = useState(initialClient ?? "");
  const [exposureId, setExposureId] = useState(initialExposure ?? "");
  const [suggestion, setSuggestion] = useState<DealSuggestion | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupBucket, setPopupBucket] = useState<RiskBucket | null>(null);
  const [bucket, setBucket] = useState<RiskBucket | null>(null);
  const [product, setProduct] = useState("");
  const [parameters, setParameters] = useState<TradeParameters | null>(null);
  const [busy, setBusy] = useState<"" | "load" | "generate" | "accept">("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const client = clients.find((item) => item.id === clientId) ?? null;
  const productInfo = products.find((item) => item.name === product);

  async function generate(forClient = clientId, forExposure = exposureId) {
    if (!forClient) return;
    setPopupOpen(true);
    setSuggestion(null);
    setBusy("generate");
    setError("");
    try {
      const result = await api<DealSuggestion>(`/api/v1/clients/${forClient}/deal-suggestions`, {
        method: "POST",
        body: JSON.stringify({ exposure_id: forExposure || null }),
      });
      setSuggestion(result);
      setPopupBucket(result.recommended_bucket);
      setExposureId(result.exposure_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate a deal");
      setPopupOpen(false);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<ClientProfile[]>("/api/v1/clients"),
      api<{ products: CatalogProduct[] }>("/api/v1/catalog"),
      api<{ run: { items: { client_id: string }[] } | null; is_today: boolean }>(`/api/v1/opportunities?tz=${encodeURIComponent(browserTimezone())}`).catch(() => null),
    ])
      .then(([list, catalog, today]) => {
        if (!active) return;
        const flaggedIds = today?.is_today && today.run ? today.run.items.map((item) => item.client_id) : [];
        setFlagged(flaggedIds);
        const rank = (id: string) => (flaggedIds.includes(id) ? flaggedIds.indexOf(id) : Number.MAX_SAFE_INTEGER);
        setClients(
          list
            .filter((item) => item.status === "active")
            .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name)),
        );
        setProducts(catalog.products);
        setBusy("");
        if (autoGenerate && initialClient && list.some((item) => item.id === initialClient)) void generate(initialClient, initialExposure ?? "");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not load clients");
        setBusy("");
      });
    return () => {
      active = false;
    };
  }, []); // Runs once on mount; URL params are fixed for this page load.

  function applyBucket(choice: RiskBucket) {
    if (!suggestion) return;
    const option = suggestion.options[choice];
    if (!option.product) return;
    setBucket(choice);
    setProduct(option.product);
    setParameters(option.parameters);
    setPopupOpen(false);
    setNotice(
      choice === suggestion.recommended_bucket
        ? `AI pick applied: ${option.product}. Review and adjust the variables below.`
        : `You overrode the AI pick with ${choice}: ${option.product}. Review and adjust the variables below.`,
    );
  }

  function changeProduct(name: string) {
    setProduct(name);
    if (parameters) setParameters({ ...parameters, product_inputs: inputsFor(products.find((item) => item.name === name), parameters.product_inputs) });
  }

  async function accept(createRationale: boolean) {
    if (!suggestion || !bucket || !parameters) return;
    setBusy("accept");
    setError("");
    setNotice("");
    try {
      const result = await api<{ pitch: Pitch | null; notes: string[] }>(`/api/v1/deal-suggestions/${suggestion.id}/accept`, {
        method: "POST",
        body: JSON.stringify({ bucket, product, parameters, create_rationale: createRationale }),
      });
      if (result.pitch) {
        router.push("/");
        return;
      }
      setNotice(["Deal choice saved to this client's history.", ...result.notes].join(" "));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the deal");
    } finally {
      setBusy("");
    }
  }

  const productChoices = useMemo(() => {
    if (!suggestion || !bucket) return products.map((item) => item.name);
    const candidates = suggestion.options[bucket].candidates;
    return candidates.length ? candidates : products.map((item) => item.name);
  }, [bucket, products, suggestion]);

  const setParam = (key: keyof TradeParameters, value: string) =>
    parameters && setParameters({ ...parameters, [key]: value.trim() === "" ? null : key === "currency_pair" ? value.toUpperCase() : value });

  return (
    <PortalShell title="Deal builder" kicker="TRADE BUILDER / AI GENERATE">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">01 · CLIENT</p>
            <h2>Pick a client</h2>
            <p className="panel-sub">Ideally the one flagged on the dashboard. AI Generate reads their profile, policy and live rates, then pre-fills the deal for you to adjust.</p>
          </div>
        </div>
        <div className="builder-grid">
          <label className="field">
            CLIENT
            <select value={clientId} onChange={(event) => { setClientId(event.target.value); setExposureId(""); setSuggestion(null); setParameters(null); }}>
              <option value="">{busy === "load" ? "Loading…" : "Select a client"}</option>
              {flagged.length > 0 && (
                <optgroup label="Flagged on today's dashboard">
                  {clients.filter((item) => flagged.includes(item.id)).map((item) => (
                    <option key={item.id} value={item.id}>★ {flagged.indexOf(item.id) + 1} - {item.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label={flagged.length ? "All other clients" : "Clients"}>
                {clients.filter((item) => !flagged.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </optgroup>
            </select>
            {clientId && flagged.includes(clientId) && <span className="flag-note">★ FLAGGED ON TODAY&apos;S DASHBOARD</span>}
          </label>
          <label className="field">
            EXPOSURE
            <select value={exposureId} onChange={(event) => setExposureId(event.target.value)} disabled={!client}>
              <option value="">Strongest opportunity (auto)</option>
              {client?.exposures.map((exposure) => <option key={exposure.id} value={exposure.id}>{exposure.label} · {exposure.currency_pair}</option>)}
            </select>
          </label>
          <div className="field">
            &nbsp;
            <button className="button button-primary" disabled={!client || !client.exposures.length || busy !== ""} onClick={() => void generate()}>
              ✦ AI Generate Trade
            </button>
          </div>
        </div>
        {client && client.exposures.length === 0 && <p className="panel-sub small">This client has no exposures yet. Add them on the Clients tab first.</p>}
      </section>

      {suggestion && parameters && bucket && (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">02 · DEAL INPUTS</p>
              <h2>{product}</h2>
              <p className="panel-sub">
                Bucket: <b style={{ textTransform: "capitalize" }}>{bucket}</b>{bucket === suggestion.recommended_bucket ? " (AI pick)" : " (your override)"}.{" "}
                Notional is the gap to the hedging policy, maturity comes from the exposure, and strike defaults to the budget rate. Pricing inputs are left for you to set.
              </p>
            </div>
            <button className="button button-outline" onClick={() => { setPopupBucket(bucket); setPopupOpen(true); }}>Change bucket</button>
          </div>
          <div className="builder-grid">
            <label className="field">
              PRODUCT
              <select value={product} onChange={(event) => changeProduct(event.target.value)}>
                {productChoices.map((name) => <option key={name}>{name}</option>)}
              </select>
            </label>
            <label className="field">CURRENCY PAIR<input value={parameters.currency_pair ?? ""} onChange={(event) => setParam("currency_pair", event.target.value)} /></label>
            <label className="field">DIRECTION<input value={parameters.direction ?? ""} onChange={(event) => setParam("direction", event.target.value)} /></label>
            <label className="field">NOTIONAL {parameters.notional_currency && <span className="hint">{parameters.notional_currency}</span>}<input inputMode="decimal" value={parameters.notional ?? ""} onChange={(event) => setParam("notional", event.target.value)} placeholder="Enter amount" /></label>
            <label className="field">MATURITY<input value={parameters.maturity ?? ""} onChange={(event) => setParam("maturity", event.target.value)} /></label>
            <label className="field">STRIKE / BUDGET<input inputMode="decimal" value={parameters.strike ?? ""} onChange={(event) => setParam("strike", event.target.value)} /></label>
            {productInfo?.requirements.barrier && (
              <label className="field">KI BARRIER<input inputMode="decimal" value={parameters.ki_barrier ?? ""} onChange={(event) => setParam("ki_barrier", event.target.value)} placeholder="Set after pricing" /></label>
            )}
            {Object.keys(parameters.product_inputs).map((key) => (
              <label key={key} className="field">
                {label(key).toUpperCase()}
                <input
                  inputMode="decimal"
                  value={parameters.product_inputs[key] ?? ""}
                  onChange={(event) => setParameters({ ...parameters, product_inputs: { ...parameters.product_inputs, [key]: event.target.value || null } })}
                  placeholder="Set after pricing"
                />
              </label>
            ))}
          </div>
          <div className="form-actions">
            <span className="muted small">Your final choice is saved to this client&apos;s history, so future suggestions learn from it.</span>
            <span className="opp-actions">
              <button className="button button-outline" disabled={busy !== ""} onClick={() => void accept(false)}>Save choice only</button>
              <button className="button button-primary" disabled={busy !== "" || !product} onClick={() => void accept(true)}>
                {busy === "accept" ? "Building rationale…" : "Build sales rationale →"}
              </button>
            </span>
          </div>
        </section>
      )}

      {popupOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ai-popup-title" onClick={(event) => event.target === event.currentTarget && busy !== "generate" && setPopupOpen(false)}>
          <div className="modal">
            <p className="section-kicker">AI GENERATE · {client?.name}</p>
            <h2 id="ai-popup-title">Choose a product bucket</h2>
            <p className="panel-sub">The AI has highlighted the bucket it would lead with. You can pick a different one; the deal is pre-filled either way.</p>
            {busy === "generate" && <p className="spinner-line">Reading the profile, policy and live rates…</p>}
            {suggestion && (
              <>
                {suggestion.reasons.length > 0 && (
                  <div className="reason-chips" style={{ marginTop: 12 }}>
                    {suggestion.reasons.map((reason) => (
                      <span key={reason.kind} className={`reason-chip tone-${reason.tone}`} tabIndex={0}>
                        {reason.title}
                        <span className="tip" role="tooltip">{reason.detail}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="bucket-grid">
                  {RISK_BUCKETS.map((choice) => {
                    const option = suggestion.options[choice];
                    return (
                      <button
                        key={choice}
                        type="button"
                        className={`bucket-card${choice === suggestion.recommended_bucket ? " recommended" : ""}${popupBucket === choice ? " selected" : ""}`}
                        disabled={!option.product}
                        onClick={() => setPopupBucket(choice)}
                        onDoubleClick={() => applyBucket(choice)}
                        aria-pressed={popupBucket === choice}
                      >
                        <h3>{choice}</h3>
                        <span className="muted small">{BUCKET_BLURB[choice]}</span>
                        <span className="product">{option.product ?? "Not available"}</span>
                        <p>{option.rationale}</p>
                      </button>
                    );
                  })}
                </div>
                <div className="ai-reason"><b>Why the AI picked {suggestion.recommended_bucket}:</b> {suggestion.recommendation_reason}</div>
                {suggestion.notes.length > 0 && <ul className="note-list">{suggestion.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
                <div className="form-actions">
                  <button className="button button-outline" onClick={() => setPopupOpen(false)}>Cancel</button>
                  <button className="button button-primary" disabled={!popupBucket || !suggestion.options[popupBucket].product} onClick={() => popupBucket && applyBucket(popupBucket)}>
                    Use {popupBucket ?? "selection"} and pre-fill deal
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </PortalShell>
  );
}
