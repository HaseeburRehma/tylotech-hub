import { serverLocale } from "@/lib/i18n/server";
import { BoardSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <BoardSkeleton label={label} columns={4} />;
}
