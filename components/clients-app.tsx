"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PortalShell, api } from "@/components/portal-shell";
import { RISK_BUCKETS, type ClientProfile, type RiskBucket } from "@/lib/opportunity-types";

type CatalogProduct = { name: string; classification: string; leveraged: boolean; regions: string[] };
type CatalogResponse = { products: CatalogProduct[]; regions: string[] };

type ExposureForm = {
  id: string;
  label: string;
  currency_pair: string;
  buy_currency: string;
  amount: string;
  amount_currency: string;
  budget_rate: string;
  hedged_amount: string;
  hedged_rate: string;
  horizon_months: string;
  next_settlement_date: string;
  next_settlement_amount: string;
};

type ClientForm = {
  name: string;
  kind: "client" | "prospect";
  status: "active" | "archived";
  contact: { name: string; email: string; phone: string };
  industry: string;
  region: string;
  risk_profile: RiskBucket;
  leverage_permitted: boolean;
  permitted_products: string[];
  hedging_policy: { min_cover_pct: string; max_cover_pct: string; max_tenor_months: string; notes: string };
  exposures: ExposureForm[];
  notes: string;
};

const s = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));

function emptyExposure(): ExposureForm {
  return {
    id: crypto.randomUUID(),
    label: "",
    currency_pair: "",
    buy_currency: "",
    amount: "",
    amount_currency: "",
    budget_rate: "",
    hedged_amount: "0",
    hedged_rate: "",
    horizon_months: "12",
    next_settlement_date: "",
    next_settlement_amount: "",
  };
}

function emptyForm(): ClientForm {
  return {
    name: "",
    kind: "client",
    status: "active",
    contact: { name: "", email: "", phone: "" },
    industry: "",
    region: "",
    risk_profile: "balanced",
    leverage_permitted: false,
    permitted_products: [],
    hedging_policy: { min_cover_pct: "", max_cover_pct: "", max_tenor_months: "", notes: "" },
    exposures: [],
    notes: "",
  };
}

function toForm(client: ClientProfile): ClientForm {
  return {
    name: client.name,
    kind: client.kind,
    status: client.status,
    contact: { ...client.contact },
    industry: client.industry,
    region: client.region,
    risk_profile: client.risk_profile,
    leverage_permitted: client.leverage_permitted,
    permitted_products: [...client.permitted_products],
    hedging_policy: {
      min_cover_pct: s(client.hedging_policy.min_cover_pct),
      max_cover_pct: s(client.hedging_policy.max_cover_pct),
      max_tenor_months: s(client.hedging_policy.max_tenor_months),
      notes: client.hedging_policy.notes,
    },
    exposures: client.exposures.map((exposure) => ({
      id: exposure.id,
      label: exposure.label,
      currency_pair: exposure.currency_pair,
      buy_currency: exposure.buy_currency,
      amount: exposure.amount,
      amount_currency: exposure.amount_currency,
      budget_rate: s(exposure.budget_rate),
      hedged_amount: s(exposure.hedged_amount),
      hedged_rate: s(exposure.hedged_rate),
      horizon_months: s(exposure.horizon_months),
      next_settlement_date: s(exposure.next_settlement_date),
      next_settlement_amount: s(exposure.next_settlement_amount),
    })),
    notes: client.notes,
  };
}

function Field({ label, children, className = "", hint }: { label: string; children: React.ReactNode; className?: string; hint?: string }) {
  return (
    <label className={`field ${className}`}>
      {label}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function ClientsApp() {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse>({ products: [], regions: [] });
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [form, setForm] = useState<ClientForm | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([api<ClientProfile[]>("/api/v1/clients"), api<CatalogResponse>("/api/v1/catalog")])
      .then(([list, cat]) => {
        if (!active) return;
        setClients(list);
        setCatalog(cat);
        const wanted = new URLSearchParams(window.location.search).get("id");
        const initial = list.find((client) => client.id === wanted) ?? null;
        if (initial) {
          setSelected(initial);
          setForm(toForm(initial));
        }
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Could not load clients"))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () =>
      clients.filter(
        (client) =>
          (showArchived || client.status === "active") &&
          `${client.name} ${client.industry} ${client.contact.name}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [clients, search, showArchived],
  );

  const productGroups = useMemo(() => {
    const groups = new Map<string, CatalogProduct[]>();
    for (const product of catalog.products) {
      if (product.classification === "n/a") continue;
      if (product.leveraged && !form?.leverage_permitted) continue;
      if (form?.region && !product.regions.includes(form.region)) continue;
      groups.set(product.classification, [...(groups.get(product.classification) ?? []), product]);
    }
    return Array.from(groups.entries());
  }, [catalog.products, form?.leverage_permitted, form?.region]);

  function open(client: ClientProfile | null) {
    setSelected(client);
    setForm(client ? toForm(client) : emptyForm());
    setError("");
    setNotice("");
    window.history.replaceState(null, "", client ? `/clients?id=${client.id}` : "/clients");
  }

  function update<K extends keyof ClientForm>(key: K, value: ClientForm[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateExposure(index: number, patch: Partial<ExposureForm>) {
    setForm((current) => {
      if (!current) return current;
      const exposures = current.exposures.slice();
      const next = { ...exposures[index], ...patch };
      if (patch.currency_pair !== undefined) next.currency_pair = patch.currency_pair.toUpperCase().replace("/", "").slice(0, 6);
      exposures[index] = next;
      return { ...current, exposures };
    });
  }

  function toggleProduct(name: string) {
    if (!form) return;
    const set = new Set(form.permitted_products);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    update("permitted_products", Array.from(set));
  }

  async function save(statusOverride?: "active" | "archived") {
    if (!form) return;
    setSaving(true);
    setError("");
    setNotice("");
    const body = {
      ...form,
      status: statusOverride ?? form.status,
      // Products hidden by the current leverage/region choice are dropped from the permitted list.
      permitted_products: form.permitted_products.filter((name) =>
        productGroups.some(([, list]) => list.some((product) => product.name === name)),
      ),
      ...(selected ? { updated_at: selected.updated_at } : {}),
    };
    try {
      const saved = selected
        ? await api<ClientProfile>(`/api/v1/clients/${selected.id}`, { method: "PUT", body: JSON.stringify(body) })
        : await api<ClientProfile>("/api/v1/clients", { method: "POST", body: JSON.stringify(body) });
      setClients((list) => [...list.filter((client) => client.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(saved);
      setForm(toForm(saved));
      window.history.replaceState(null, "", `/clients?id=${saved.id}`);
      setNotice(statusOverride === "archived" ? "Client archived." : statusOverride === "active" ? "Client restored." : "Client profile saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the client");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PortalShell title="Clients" kicker="CLIENT PROFILES / FOUNDATION FOR AI OPPORTUNITIES">
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-success" role="status">{notice}</div>}
      <div className="clients-layout">
        <aside className="client-rail" aria-label="Client list">
          <button className="button button-primary" onClick={() => open(null)}>+ New client or prospect</button>
          <input placeholder="Search clients" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search clients" />
          <label className="check small"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label>
          {loading && <p className="muted small">Loading…</p>}
          {!loading && visible.length === 0 && <p className="muted small">No clients yet. Add one to start generating opportunities.</p>}
          {visible.map((client) => (
            <button key={client.id} className={`client-item${selected?.id === client.id ? " active" : ""}`} onClick={() => open(client)}>
              <strong>{client.name}</strong>
              <small>
                {client.kind === "prospect" ? "Prospect" : "Client"} · {client.exposures.length} exposure{client.exposures.length === 1 ? "" : "s"}
                {client.status === "archived" && <span className="archived"> · archived</span>}
              </small>
            </button>
          ))}
        </aside>

        {form ? (
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="section-kicker">{selected ? "EDIT PROFILE" : "NEW PROFILE"}</p>
                <h2>{form.name || "Untitled client"}</h2>
                {selected && <p className="panel-sub">Last updated {new Date(selected.updated_at).toLocaleString()}. Every change is kept in the audit log.</p>}
              </div>
              {selected && selected.exposures.length > 0 && (
                <Link className="button button-outline" href={`/deal-builder?client=${selected.id}&generate=1`}>AI Generate deal</Link>
              )}
            </div>

            <div className="form-section">
              <h3>DETAILS</h3>
              <div className="field-grid">
                <Field label="NAME *" className="span-2"><input value={form.name} onChange={(event) => update("name", event.target.value)} maxLength={160} /></Field>
                <Field label="TYPE">
                  <select value={form.kind} onChange={(event) => update("kind", event.target.value as ClientForm["kind"])}>
                    <option value="client">Client</option>
                    <option value="prospect">Prospect</option>
                  </select>
                </Field>
                <Field label="CONTACT NAME"><input value={form.contact.name} onChange={(event) => update("contact", { ...form.contact, name: event.target.value })} /></Field>
                <Field label="CONTACT EMAIL"><input type="email" value={form.contact.email} onChange={(event) => update("contact", { ...form.contact, email: event.target.value })} /></Field>
                <Field label="CONTACT PHONE"><input value={form.contact.phone} onChange={(event) => update("contact", { ...form.contact, phone: event.target.value })} /></Field>
                <Field label="INDUSTRY"><input value={form.industry} onChange={(event) => update("industry", event.target.value)} placeholder="e.g. Importer, wine exporter" /></Field>
                <Field label="REGION" hint="Limits products to those available in the region">
                  <select value={form.region} onChange={(event) => update("region", event.target.value)}>
                    <option value="">Any</option>
                    {catalog.regions.map((region) => <option key={region}>{region}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div className="form-section">
              <h3>RISK PROFILE AND SUITABLE PRODUCTS</h3>
              <div className="field-grid">
                <Field label="RISK PROFILE" hint="Starting bucket for AI Generate">
                  <span className="segmented" role="group">
                    {RISK_BUCKETS.map((bucket) => (
                      <button type="button" key={bucket} className={form.risk_profile === bucket ? "on" : ""} onClick={() => update("risk_profile", bucket)}>{bucket}</button>
                    ))}
                  </span>
                </Field>
                <Field label="LEVERAGE">
                  <span className="check"><input type="checkbox" checked={form.leverage_permitted} onChange={(event) => update("leverage_permitted", event.target.checked)} /> Leveraged (LEV) products permitted</span>
                </Field>
              </div>
              <p className="panel-sub small">
                Permitted products: tick the products in scope for this client. Leave all unticked to allow every product that fits the region and leverage settings.
                {form.permitted_products.length > 0 && <> <b>{form.permitted_products.length} selected.</b> <button type="button" className="text-button" onClick={() => update("permitted_products", [])}>Clear</button></>}
              </p>
              <div className="product-groups">
                {productGroups.map(([classification, products]) => (
                  <div key={classification}>
                    <h4>{classification.toUpperCase()}</h4>
                    {products.map((product) => (
                      <label key={product.name}>
                        <input type="checkbox" checked={form.permitted_products.includes(product.name)} onChange={() => toggleProduct(product.name)} />
                        {product.name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h3>HEDGING POLICY</h3>
              <div className="field-grid">
                <Field label="MINIMUM COVER %"><input inputMode="decimal" value={form.hedging_policy.min_cover_pct} onChange={(event) => update("hedging_policy", { ...form.hedging_policy, min_cover_pct: event.target.value })} placeholder="e.g. 50" /></Field>
                <Field label="MAXIMUM COVER %"><input inputMode="decimal" value={form.hedging_policy.max_cover_pct} onChange={(event) => update("hedging_policy", { ...form.hedging_policy, max_cover_pct: event.target.value })} placeholder="e.g. 80" /></Field>
                <Field label="MAXIMUM TENOR (MONTHS)"><input inputMode="numeric" value={form.hedging_policy.max_tenor_months} onChange={(event) => update("hedging_policy", { ...form.hedging_policy, max_tenor_months: event.target.value })} placeholder="e.g. 12" /></Field>
                <Field label="POLICY NOTES" className="span-3"><textarea value={form.hedging_policy.notes} onChange={(event) => update("hedging_policy", { ...form.hedging_policy, notes: event.target.value })} placeholder="Board-approved policy details, layering rules, restrictions…" /></Field>
              </div>
            </div>

            <div className="form-section">
              <h3>FX EXPOSURES AND BUDGET RATES</h3>
              {form.exposures.length === 0 && <p className="panel-sub small">Opportunities are generated per exposure. Add at least one.</p>}
              {form.exposures.map((exposure, index) => {
                const pair = exposure.currency_pair;
                const currencies = pair.length === 6 ? [pair.slice(0, 3), pair.slice(3)] : [];
                return (
                  <div key={exposure.id} className="exposure-card">
                    <div className="exposure-head">
                      <span>Exposure {index + 1}</span>
                      <button type="button" className="text-button danger-text" onClick={() => update("exposures", form.exposures.filter((_, i) => i !== index))}>Remove</button>
                    </div>
                    <div className="field-grid">
                      <Field label="DESCRIPTION" className="span-2"><input value={exposure.label} onChange={(event) => updateExposure(index, { label: event.target.value })} placeholder="e.g. USD supplier payments" /></Field>
                      <Field label="CURRENCY PAIR *"><input value={exposure.currency_pair} onChange={(event) => updateExposure(index, { currency_pair: event.target.value })} placeholder="AUDUSD" /></Field>
                      <Field label="CLIENT BUYS *" hint="The currency the client needs">
                        <select value={exposure.buy_currency} onChange={(event) => updateExposure(index, { buy_currency: event.target.value, amount_currency: exposure.amount_currency || event.target.value })} disabled={!currencies.length}>
                          <option value="">Select</option>
                          {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                        </select>
                      </Field>
                      <Field label="EXPOSURE AMOUNT *"><input inputMode="decimal" value={exposure.amount} onChange={(event) => updateExposure(index, { amount: event.target.value })} placeholder="3000000" /></Field>
                      <Field label="AMOUNT CURRENCY *">
                        <select value={exposure.amount_currency} onChange={(event) => updateExposure(index, { amount_currency: event.target.value })} disabled={!currencies.length}>
                          <option value="">Select</option>
                          {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                        </select>
                      </Field>
                      <Field label="BUDGET RATE"><input inputMode="decimal" value={exposure.budget_rate} onChange={(event) => updateExposure(index, { budget_rate: event.target.value })} placeholder="0.6400" /></Field>
                      <Field label="ALREADY HEDGED" hint="Same currency as the amount"><input inputMode="decimal" value={exposure.hedged_amount} onChange={(event) => updateExposure(index, { hedged_amount: event.target.value })} placeholder="0" /></Field>
                      <Field label="AVG RATE OF EXISTING HEDGES" hint="Enables the 'average higher' tactic box"><input inputMode="decimal" value={exposure.hedged_rate} onChange={(event) => updateExposure(index, { hedged_rate: event.target.value })} placeholder="e.g. 0.6550" /></Field>
                      <Field label="HORIZON (MONTHS)"><input inputMode="numeric" value={exposure.horizon_months} onChange={(event) => updateExposure(index, { horizon_months: event.target.value })} /></Field>
                      <Field label="NEXT SETTLEMENT DATE"><input type="date" value={exposure.next_settlement_date} onChange={(event) => updateExposure(index, { next_settlement_date: event.target.value })} /></Field>
                      <Field label="NEXT SETTLEMENT AMOUNT" hint="Amount due on that date; used to size the deal"><input inputMode="decimal" value={exposure.next_settlement_amount} onChange={(event) => updateExposure(index, { next_settlement_amount: event.target.value })} placeholder="e.g. 250000" /></Field>
                    </div>
                  </div>
                );
              })}
              <button type="button" className="button button-outline" onClick={() => update("exposures", [...form.exposures, emptyExposure()])}>+ Add exposure</button>
            </div>

            <div className="form-section">
              <h3>NOTES</h3>
              <Field label="ADVISOR NOTES" className="span-3"><textarea value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Relationship context, preferences, past conversations…" /></Field>
            </div>

            <div className="form-actions">
              <span>
                {selected && (
                  <button type="button" className="text-button danger-text" disabled={saving} onClick={() => void save(form.status === "archived" ? "active" : "archived")}>
                    {form.status === "archived" ? "Restore client" : "Archive client"}
                  </button>
                )}
              </span>
              <span className="opp-actions">
                <button type="button" className="button button-outline" disabled={saving} onClick={() => (selected ? setForm(toForm(selected)) : setForm(null))}>Discard changes</button>
                <button type="button" className="button button-primary" disabled={saving || !form.name.trim()} onClick={() => void save()}>{saving ? "Saving…" : "Save profile"}</button>
              </span>
            </div>
          </section>
        ) : (
          <section className="panel opp-empty">
            Select a client to view or amend their profile, or create a new client or prospect. Budget rates, hedging policy and suitable
            products captured here drive the daily AI Trade Opportunities.
          </section>
        )}
      </div>
    </PortalShell>
  );
}
