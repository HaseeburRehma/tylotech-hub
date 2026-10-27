import { serverLocale } from "@/lib/i18n/server";
import { ChartsPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <ChartsPageSkeleton label={label} />;
}
