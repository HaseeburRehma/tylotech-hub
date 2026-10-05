import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOGIN_BRAND_COOKIE, loginPathFor } from "@/lib/login-brand";

export default function Home() {
  redirect(loginPathFor(cookies().get(LOGIN_BRAND_COOKIE)?.value));
}
