import { serverLocale } from "@/lib/i18n/server";
import { ChatSkeleton } from "@/components/ui/skeletons";

export default function Loading() {
  const label = serverLocale() === "de" ? "Wird geladen…" : "Loading…";
  return <ChatSkeleton label={label} />;
}
