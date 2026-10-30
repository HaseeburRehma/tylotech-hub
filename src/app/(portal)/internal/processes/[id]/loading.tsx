import { serverLocale } from "@/lib/i18n/server";
import { DetailSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <DetailSkeleton label={label} tabs={0} />;
}
