"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import type { Card, Pitch, SectionKey, TradeParameters } from "@/lib/types";

const sections: { key: SectionKey; title: string; description: string; kicker: string }[] = [
  { key: "market_conditions", title: "Market conditions", description: "Macro, technicals, rates and commodities", kicker: "Market context" },
  { key: "client_why", title: "Client why", description: "Commercial rationale and FX requirements", kicker: "Client rationale" },
  { key: "product_why", title: "Product why", description: "Structure fit, payoff logic and alternatives", kicker: "Structure rationale" },
];

const emptyParameters: TradeParameters = {
  currency_pair: null,
  direction: null,
  notional: null,
  notional_currency: null,
  maturity: null,
  strike: null,
  ki_barrier: null,
  product_inputs: {},
};

function withProductInputs(parameters: TradeParameters): TradeParameters {
  return { ...parameters, product_inputs: parameters.product_inputs ?? {} };
}

function formatInputLabel(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = (await response.json().catch(() => ({}))) as T & { detail?: string; error?: string };
  if (!response.ok) throw new Error(result.detail || result.error || `Request failed (${response.status})`);
  return result;
}

function ProductInputField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string | null;
  onChange: (name: string, value: string | null) => void;
}) {
  return (
    <label className="parameter-field">
      <span>{formatInputLabel(name)}</span>
      <span className="parameter-input-wrap">
        <input
          value={value ?? ""}
          onChange={(event) => onChange(name, event.target.value || null)}
          placeholder="Not specified"
          inputMode="decimal"
          aria-label={formatInputLabel(name)}
        />
      </span>
    </label>
  );
}

function Icon({ name, size = 18 }: { name: "spark" | "copy" | "refresh" | "close" | "check" | "shield"; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const paths = {
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4.9 9a7.5 7.5 0 0 1 12.4-2L20 12M4 17v-5h5" /><path d="M19.1 15a7.5 7.5 0 0 1-12.4 2L4 12" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function ParameterField({
  label,
  name,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  name: keyof TradeParameters;
  value: string | null;
  onChange: (key: keyof TradeParameters, value: string | null) => void;
  placeholder: string;
  suffix?: string;
}) {
  return (
    <label className="parameter-field">
      <span>{label}</span>
      <span className="parameter-input-wrap">
        <input
          value={value ?? ""}
          onChange={(event) => onChange(name, event.target.value || null)}
          placeholder={placeholder}
          inputMode={["notional", "strike", "ki_barrier"].includes(name) ? "decimal" : "text"}
        />
        {suffix && <small>{suffix}</small>}
      </span>
    </label>
  );
}

function CardView({
  card,
  index,
  onSave,
  onRemove,
}: {
  card: Card;
  index: number;
  onSave: (card: Card) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save card");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`rationale-card${editing ? " is-editing" : ""}`} onDoubleClick={() => !editing && setEditing(true)} title={editing ? undefined : "Double-click to edit"}>
      <span className="card-index">{String(index + 1).padStart(2, "0")}</span>
      {editing ? (
        <div className="card-editor">
          <input aria-label="Card title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={120} autoFocus />
          <textarea aria-label="Card text" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} maxLength={1_200} rows={4} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="card-edit-actions">
            <button className="text-button" onClick={() => { setDraft(card); setEditing(false); }}>Cancel</button>
            <button className="button button-small button-primary" disabled={busy} onClick={() => void save()}>
              <Icon name="check" size={15} /> {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <button className="remove-card" aria-label={`Remove ${card.title}`} onClick={() => void onRemove()}><Icon name="close" size={15} /></button>
          <h3>{card.title}</h3>
          <p>{card.body}</p>
          <span className="edit-hint">Double-click to edit</span>
        </>
      )}
    </article>
  );
}

function RationaleSection({
  definition,
  cards,
  busy,
  onRegenerate,
  onUpdate,
}: {
  definition: (typeof sections)[number];
  cards: Card[];
  busy: boolean;
  onRegenerate: (section: SectionKey, steering: string) => Promise<void>;
  onUpdate: (section: SectionKey, cards: Card[]) => Promise<void>;
}) {
  const [steering, setSteering] = useState("");
  return (
    <section className="section-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">{definition.kicker}</p>
          <h2>{definition.title}</h2>
          <p className="section-description">{definition.description}</p>
        </div>
        <span className="count-badge">{cards.length} <span>cards</span></span>
      </div>
      <div className="card-grid">
        {cards.map((card, index) => (
          <CardView
            key={`${definition.key}-${index}-${card.title}-${card.body}`}
            card={card}
            index={index}
            onSave={(updated) => {
              const next = cards.slice();
              next[index] = updated;
              return onUpdate(definition.key, next);
            }}
            onRemove={() => onUpdate(definition.key, cards.filter((_, current) => current !== index))}
          />
        ))}
        {cards.length === 0 && <p className="empty-cards">No cards in this section. Regenerate it to create a fresh set.</p>}
      </div>
      <div className="section-controls">
        <label className="steering-field">
          <span>Steer this section</span>
          <input value={steering} onChange={(event) => setSteering(event.target.value)} placeholder="e.g. Focus on the client’s 12-month payable" maxLength={1_000} />
        </label>
        <button className="button button-outline" disabled={busy} onClick={() => void onRegenerate(definition.key, steering)}>
          <Icon name="refresh" size={16} /> {busy ? "Generating…" : "Regenerate"}
        </button>
      </div>
    </section>
  );
}

export function PitchApp() {
  const [scenario, setScenario] = useState("");
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [saved, setSaved] = useState<Pitch[]>([]);
  const [parameters, setParameters] = useState<TradeParameters>(emptyParameters);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sectionBusy, setSectionBusy] = useState<SectionKey | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  const loadSaved = useCallback(async (selectLatest = false) => {
    const items = await api<Pitch[]>("/api/v1/pitches");
    setSaved(items);
    if (selectLatest && items.length) {
      setPitch(items[0]);
      setScenario(items[0].scenario);
      setParameters(withProductInputs(items[0].parameters));
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<Pitch[]>("/api/v1/pitches")
      .then((items) => {
        if (!active) return;
        setSaved(items);
        if (items.length) {
          setPitch(items[0]);
          setScenario(items[0].scenario);
          setParameters(withProductInputs(items[0].parameters));
        }
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load saved drafts");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function startNew() {
    setPitch(null);
    setParameters(emptyParameters);
    setScenario("");
    setError("");
    setNotice("");
  }

  function choosePitch(item: Pitch) {
    setPitch(item);
    setScenario(item.scenario);
    setParameters(withProductInputs(item.parameters));
    setError("");
    setNotice("");
  }

  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const created = await api<Pitch>("/api/v1/pitches", { method: "POST", body: JSON.stringify({ scenario }) });
      setPitch(created);
      setParameters(withProductInputs(created.parameters));
      setScenario(created.scenario);
      await loadSaved();
      setNotice("Draft created and saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not generate the draft");
    } finally {
      setGenerating(false);
    }
  }

  async function saveParameters() {
    if (!pitch) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api<Pitch>(`/api/v1/pitches/${pitch.id}`, { method: "PATCH", body: JSON.stringify({ parameters }) });
      setPitch(updated);
      setParameters(updated.parameters);
      await loadSaved();
      setNotice("Trade inputs saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save inputs");
    } finally {
      setSaving(false);
    }
  }

  async function updateSection(section: SectionKey, cards: Card[]) {
    if (!pitch) return;
    setError("");
    try {
      const updated = await api<Pitch>(`/api/v1/pitches/${pitch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ sections: { [section]: cards } }),
      });
      setPitch(updated);
      await loadSaved();
      setNotice("Rationale section saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save this section");
      throw reason;
    }
  }

  async function regenerateSection(section: SectionKey, steering: string) {
    if (!pitch) return;
    setSectionBusy(section);
    setError("");
    setNotice("");
    try {
      const updated = await api<Pitch>(`/api/v1/pitches/${pitch.id}/sections/${section}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ steering }),
      });
      setPitch(updated);
      await loadSaved();
      setNotice("Section regenerated. Other sections were left unchanged.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not regenerate this section");
    } finally {
      setSectionBusy(null);
    }
  }

  async function copyDraft() {
    if (!pitch) return;
    const lines = [
      `Product: ${pitch.product.name}`,
      `Pair: ${parameters.currency_pair ?? "Not specified"}`,
      `Direction: ${parameters.direction ?? "Not specified"}`,
      `Notional: ${parameters.notional ? `${parameters.notional_currency ?? ""} ${parameters.notional}` : "Not specified"}`,
      `Maturity: ${parameters.maturity ?? "Not specified"}`,
      `Strike: ${parameters.strike ?? "Not specified"}`,
      ...Object.entries(parameters.product_inputs ?? {}).map(
        ([name, value]) => `${formatInputLabel(name)}: ${value ?? "Not specified"}`,
      ),
      ...(pitch.market_data?.spot_quote
        ? [
            `Twelve Data spot reference: ${pitch.market_data.spot_quote.symbol} ${pitch.market_data.spot_quote.price}`,
            `Quote timestamp: ${pitch.market_data.spot_quote.quote_datetime ?? pitch.market_data.spot_quote.fetched_at}`,
          ]
        : []),
      ...(pitch.market_data?.interest_rates ?? []).map(
        (rate) =>
          `Supabase interest rate: ${rate.currency_pair} ${rate.rate_type} ${rate.rate} (updated ${rate.updated_at})`,
      ),
      ...(pitch.market_data?.volatility_surface ?? []).map(
        (point) =>
          `Supabase volatility: ${point.currency_pair} ${point.tenor} ATM ${point.atm ?? "n/a"} (updated ${point.updated_at})`,
      ),
      "",
      ...sections.flatMap((definition) => [
        definition.title,
        ...(pitch.sections[definition.key] ?? []).map((card) => `${card.title}: ${card.body}`),
        "",
      ]),
      ...(pitch.risk_warning ? [`Risk notice: ${pitch.risk_warning}`] : []),
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (reason) {
      setError(reason instanceof Error ? `Could not copy rationale: ${reason.message}` : "Could not copy rationale");
    }
  }

  const currentPair = parameters.currency_pair ?? "Pair pending";

  if (loading) return <main className="loading-shell"><div className="loading-mark">F</div><span>Opening your workspace</span></main>;

  return (
    <div className="workspace">
      <header className="topbar">
        <div className="brand-lockup" aria-label="Foundry FX">
          <Image className="brand-mark" src="/foundry-mark.svg" alt="" width={42} height={42} priority />
          <span className="brand-text"><strong>FOUNDRY</strong><small>FX STRUCTURING PLATFORM FOR SALES</small></span>
        </div>
        <div className="topbar-right"><span className="private-pill"><Icon name="shield" size={14} /> OPEN WORKSPACE</span></div>
      </header>

      <main className="main-shell">
        <section className="hero-row">
          <div>
            <p className="eyebrow"><span className="eyebrow-dot" /> ADVISOR TOOLS <span className="eyebrow-slash">/</span> RATIONALE STUDIO</p>
            <h1>Make the thinking<br /><em>clear.</em></h1>
            <p className="hero-copy">Turn a client’s FX needs into a thoughtful, structured conversation.</p>
          </div>
          <div className="hero-note"><span className="hero-note-line" /><p>Draft with context.<br /><strong>Always review before sharing.</strong></p></div>
        </section>

        <div className="workbench-layout">
          <aside className="saved-rail">
            <button className={`new-draft${pitch ? "" : " selected"}`} onClick={startNew}><span className="plus-mark">+</span> New rationale</button>
            <div className="rail-label">RECENT DRAFTS <span>{saved.length.toString().padStart(2, "0")}</span></div>
            <div className="saved-list">
              {saved.length === 0 && <p className="rail-empty">Your saved drafts will appear here.</p>}
              {saved.map((item) => (
                <button key={item.id} className={`saved-item${pitch?.id === item.id ? " active" : ""}`} onClick={() => choosePitch(item)}>
                  <span className="saved-item-pair">{item.tags.currency_pair ?? "FX DRAFT"}</span>
                  <strong>{item.product.name}</strong>
                  <small>{item.parameters.maturity ?? item.tags.client_type ?? "Scenario draft"}</small>
                </button>
              ))}
            </div>
            <div className="rail-foot"><Image className="rail-foot-mark" src="/foundry-mark.svg" alt="" width={24} height={24} /><span>FOUNDRY FX<br /><small>STRUCTURED SOLUTIONS</small></span></div>
          </aside>

          <div className="content-column">
            <section className="scenario-panel">
              <div className="scenario-topline">
                <div className="step-tag"><span>01</span> CLIENT CONTEXT</div>
                {pitch && <span className="saved-indicator"><Icon name="check" size={13} /> SAVED DRAFT</span>}
              </div>
              <h2>Start with their situation.</h2>
              <p className="scenario-intro">Share the exposure, objectives and preferences. We’ll organize the details into a draft for you to review.</p>
              <form onSubmit={generate}>
                <label className="scenario-label" htmlFor="scenario">CLIENT SCENARIO</label>
                <textarea
                  id="scenario"
                  value={scenario}
                  onChange={(event) => setScenario(event.target.value)}
                  placeholder="e.g. AUD importer with USD 3 million payable in 12 months. Budget rate 0.6400. Wants downside protection while retaining some participation…"
                  maxLength={4_000}
                  rows={4}
                  required={!pitch}
                />
                <div className="scenario-bottom">
                  <span>{scenario.length.toLocaleString()} / 4,000</span>
                  <button className="button button-primary" disabled={generating || !scenario.trim()}>
                    <Icon name="spark" size={17} /> {generating ? "Building your draft…" : pitch ? "Generate new draft" : "Build rationale"}
                  </button>
                </div>
              </form>
              <div className="privacy-note"><Icon name="shield" size={15} /> Avoid client names or account details. Generated content is a draft, not advice.</div>
            </section>

            {error && <div className="alert alert-error" role="alert"><Icon name="close" /> {error}</div>}
            {notice && <div className="alert alert-success" role="status"><Icon name="check" /> {notice}</div>}

            {pitch ? (
              <>
                <section className="trade-panel">
                  <div className="trade-header">
                    <div><div className="step-tag"><span>02</span> SUGGESTED STRUCTURE</div><h2>Trade snapshot</h2></div>
                    <button className="button button-outline copy-button" onClick={() => void copyDraft()}><Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy rationale"}</button>
                  </div>
                  <div className="tag-row">
                    <span className="product-tag">{pitch.tags.product_type}</span>
                    <span className="plain-tag">{currentPair}</span>
                    {pitch.tags.client_type && <span className="plain-tag">{pitch.tags.client_type}</span>}
                  </div>
                  <div className="parameter-grid">
                    <ParameterField label="CURRENCY PAIR" name="currency_pair" value={parameters.currency_pair} onChange={(key, value) => setParameters({ ...parameters, [key]: value?.toUpperCase() ?? null })} placeholder="Not detected" />
                    <ParameterField label="DIRECTION" name="direction" value={parameters.direction} onChange={(key, value) => setParameters({ ...parameters, [key]: value })} placeholder="Not specified" />
                    <ParameterField label="NOTIONAL" name="notional" value={parameters.notional} onChange={(key, value) => setParameters({ ...parameters, [key]: value })} placeholder="Not specified" suffix={parameters.notional_currency ?? undefined} />
                    <ParameterField label="MATURITY" name="maturity" value={parameters.maturity} onChange={(key, value) => setParameters({ ...parameters, [key]: value })} placeholder="Not specified" />
                    <ParameterField label="STRIKE / BUDGET" name="strike" value={parameters.strike} onChange={(key, value) => setParameters({ ...parameters, [key]: value })} placeholder="Not specified" />
                    {pitch.product_requirements.barrier && <ParameterField label="KI BARRIER" name="ki_barrier" value={parameters.ki_barrier} onChange={(key, value) => setParameters({ ...parameters, [key]: value })} placeholder="Not specified" />}
                    {pitch.product_requirements.rates.map((name) => (
                      <ProductInputField
                        key={name}
                        name={name}
                        value={parameters.product_inputs?.[name] ?? null}
                        onChange={(key, value) =>
                          setParameters({
                            ...parameters,
                            product_inputs: {
                              ...parameters.product_inputs,
                              [key]: value,
                            },
                          })
                        }
                      />
                    ))}
                    {pitch.product_requirements.target && (
                      <ProductInputField
                        name="target"
                        value={parameters.product_inputs?.target ?? null}
                        onChange={(key, value) =>
                          setParameters({
                            ...parameters,
                            product_inputs: {
                              ...parameters.product_inputs,
                              [key]: value,
                            },
                          })
                        }
                      />
                    )}
                    {pitch.product_requirements.lev && (
                      <ProductInputField
                        name="lev"
                        value={parameters.product_inputs?.lev ?? null}
                        onChange={(key, value) =>
                          setParameters({
                            ...parameters,
                            product_inputs: {
                              ...parameters.product_inputs,
                              [key]: value,
                            },
                          })
                        }
                      />
                    )}
                  </div>
                  <div className="trade-footer">
                    <span>All trade inputs are editable. Pricing values are not calculated by this draft.</span>
                    <button className="text-button save-inputs" onClick={() => void saveParameters()} disabled={saving}>{saving ? "Saving…" : "Save inputs"} <Icon name="check" size={14} /></button>
                  </div>
                </section>

                <section className="market-data-banner" aria-label="Market data snapshot">
                  <div>
                    <span className="section-kicker">MARKET DATA REFERENCE</span>
                    {pitch.market_data?.spot_quote && (
                      <p>
                        <strong>{pitch.market_data.spot_quote.symbol}</strong>{" "}
                        <strong>{pitch.market_data.spot_quote.price}</strong>
                        {" · "}Twelve Data
                        {" · "}Quote time:{" "}
                        {pitch.market_data.spot_quote.quote_datetime ??
                          pitch.market_data.spot_quote.fetched_at}
                      </p>
                    )}
                    {pitch.market_data?.interest_rates?.map((rate, index) => (
                      <p key={`rate-${rate.rate_type}-${index}`}>
                        <strong>{rate.currency_pair}</strong> {rate.rate_type}: {rate.rate}
                        {" · "}Supabase · Updated {rate.updated_at}
                      </p>
                    ))}
                    {pitch.market_data?.volatility_surface?.map((point, index) => (
                      <p key={`vol-${point.tenor}-${index}`}>
                        <strong>{point.currency_pair}</strong> {point.tenor} volatility
                        {" · "}ATM {point.atm ?? "n/a"}
                        {point.rr_25d !== null ? ` · RR25 ${point.rr_25d}` : ""}
                        {point.bf_25d !== null ? ` · BF25 ${point.bf_25d}` : ""}
                        {" · "}Supabase · Updated {point.updated_at}
                      </p>
                    ))}
                    {!pitch.market_data?.spot_quote &&
                      !pitch.market_data?.interest_rates?.length &&
                      !pitch.market_data?.volatility_surface?.length && (
                        <p>
                          No market observations were returned for this pair. Check the Supabase
                          table data and read policies.
                        </p>
                      )}
                  </div>
                  <small>
                    Spot quotes are reference-only, not forward or executable prices. Rates and
                    volatility reflect the source tables; verify observation dates and units.
                  </small>
                </section>

                <div className="rationale-heading">
                  <div><div className="step-tag"><span>03</span> ADVISOR TALKING POINTS</div><h2>A story in three parts.</h2></div>
                  <span className="editable-note">EDITABLE · DOUBLE-CLICK A CARD</span>
                </div>
                {sections.map((definition) => (
                  <RationaleSection
                    key={definition.key}
                    definition={definition}
                    cards={pitch.sections[definition.key] ?? []}
                    busy={sectionBusy === definition.key}
                    onRegenerate={regenerateSection}
                    onUpdate={updateSection}
                  />
                ))}
                {pitch.risk_warning && <section className="risk-banner"><span className="risk-icon"><Icon name="shield" size={19} /></span><div><span className="risk-label">STRUCTURE-SPECIFIC RISK NOTICE</span><p>{pitch.risk_warning}</p></div></section>}
                <p className="disclaimer">For internal advisor drafting only. Verify all facts, pricing and product terms independently before discussing with a client. This tool does not execute trades or provide financial advice.</p>
              </>
            ) : (
              <section className="empty-workspace">
                <span className="empty-orbit"><Icon name="spark" size={25} /></span>
                <p className="section-kicker">YOUR NEXT CONVERSATION</p>
                <h2>Begin with the client.</h2>
                <p>Add a scenario above to create a structured draft with editable trade inputs, three rationale sections and a product-aware risk notice.</p>
                <div className="empty-points"><span>01 <b>Structure</b></span><span>02 <b>Rationale</b></span><span>03 <b>Risk context</b></span></div>
              </section>
            )}
          </div>
        </div>
        <footer className="page-footer"><span>FOUNDRY FX · RATIONALE STUDIO</span><span>ADVISOR DRAFTING TOOL <i>·</i> NOT FOR AUTOMATED EXECUTION</span></footer>
      </main>
    </div>
  );
}
