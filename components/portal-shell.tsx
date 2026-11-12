"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/app/opportunities.css";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clients", label: "Clients" },
  { href: "/deal-builder", label: "Deal builder" },
  { href: "/", label: "Rationale Studio" },
];

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = (await response.json().catch(() => ({}))) as T & { detail?: string; error?: string };
  if (!response.ok) throw new Error(result.detail || result.error || `Request failed (${response.status})`);
  return result;
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Main navigation, shared by the new pages and the Rationale Studio header. */
export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="portal-nav" aria-label="Main">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined} aria-current={pathname === link.href ? "page" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function PortalShell({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return (
    <div className="workspace">
      <header className="topbar">
        <Link className="brand-lockup" href="/dashboard" aria-label="Foundry FX dashboard">
          <Image className="brand-mark" src="/foundry-mark.svg" alt="" width={42} height={42} priority />
          <span className="brand-text"><strong>FOUNDRY</strong><small>FX STRUCTURING PLATFORM FOR SALES</small></span>
        </Link>
        <PortalNav />
      </header>
      <main className="main-shell opp-main">
        <div className="opp-hero">
          <p className="eyebrow"><span className="eyebrow-dot" /> {kicker}</p>
          <h1>{title}</h1>
        </div>
        {children}
        <footer className="page-footer"><span>FOUNDRY FX · AI TRADE OPPORTUNITIES</span><span>ADVISOR TOOL <i>·</i> NOT FOR AUTOMATED EXECUTION</span></footer>
      </main>
    </div>
  );
}
