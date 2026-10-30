import { serverLocale } from "@/lib/i18n/server";
import { FormPageSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <FormPageSkeleton label={label} sections={2} />;
}
