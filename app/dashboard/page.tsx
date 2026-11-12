import type { Metadata } from "next";
import { OpportunityDashboard } from "@/components/opportunity-dashboard";

export const metadata: Metadata = { title: "Dashboard | Foundry FX" };

export default function DashboardPage() {
  return <OpportunityDashboard />;
}
