import { cookies } from "next/headers";
import { ACTIVE_CLIENT_COOKIE } from "./active-client";

/** The client a staff member is working on: explicit ?client= wins, then the sidebar cookie. */
export function activeClientRef(param?: string | null): string | null {
  if (param) return param;
  const raw = cookies().get(ACTIVE_CLIENT_COOKIE)?.value;
  return raw ? decodeURIComponent(raw) : null;
}
