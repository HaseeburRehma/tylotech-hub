import { Loader2 } from "lucide-react";

/** Route-level suspense fallback so navigation shows a spinner, not a blank frame. */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}
