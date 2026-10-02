import type { AiTool } from "@/types";

export const AI_TOOLS: AiTool[] = [
  { id: "t1", name: "ait.cg.name", slug: "content-generator", description: "ait.cg.blurb", icon: "PenLine", category: "ait.cat.content", is_active: true, unlocked: true },
  { id: "t2", name: "ait.ad.name", slug: "ad-copy", description: "ait.ad.blurb", icon: "Megaphone", category: "ait.cat.ads", is_active: true, unlocked: true },
  { id: "t3", name: "ait.seo.name", slug: "seo-analyzer", description: "ait.seo.blurb", icon: "Search", category: "ait.cat.seo", is_active: true, unlocked: true },
  { id: "t4", name: "ait.aud.name", slug: "audience", description: "ait.aud.blurb", icon: "Users", category: "ait.cat.analysis", is_active: true, unlocked: true },
  { id: "t5", name: "ait.email.name", slug: "email", description: "ait.email.blurb", icon: "Mail", category: "ait.cat.content", is_active: true, unlocked: true },
  { id: "t6", name: "ait.lp.name", slug: "lp-audit", description: "ait.lp.blurb", icon: "LayoutTemplate", category: "ait.cat.analysis", is_active: true, unlocked: true },
];
