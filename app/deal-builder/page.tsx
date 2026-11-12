import type { Metadata } from "next";
import { DealBuilder } from "@/components/deal-builder";

export const metadata: Metadata = { title: "Deal builder | Foundry FX" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function first(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) || null;
}

export default async function DealBuilderPage({ searchParams }: Props) {
  const params = await searchParams;
  return (
    <DealBuilder
      initialClient={first(params.client)}
      initialExposure={first(params.exposure)}
      autoGenerate={first(params.generate) === "1"}
    />
  );
}
