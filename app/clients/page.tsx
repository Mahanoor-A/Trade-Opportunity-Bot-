import type { Metadata } from "next";
import { ClientsApp } from "@/components/clients-app";

export const metadata: Metadata = { title: "Clients | Foundry FX" };

export default function ClientsPage() {
  return <ClientsApp />;
}
