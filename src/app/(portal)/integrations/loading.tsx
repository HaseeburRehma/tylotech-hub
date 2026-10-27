import { serverLocale } from "@/lib/i18n/server";
import { CardGridSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <CardGridSkeleton label={label} cards={4} columns={2} />;
}
