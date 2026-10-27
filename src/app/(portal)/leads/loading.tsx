import { serverLocale } from "@/lib/i18n/server";
import { ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <ListPageSkeleton label={label} stats={4} filters={3} rows={8} />;
}
