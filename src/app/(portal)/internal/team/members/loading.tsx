import { serverLocale } from "@/lib/i18n/server";
import { ListPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <ListPageSkeleton label={label} filters={1} rows={6} />;
}
