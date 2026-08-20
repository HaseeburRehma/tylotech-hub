import {
  Bot,
  FileText,
  LayoutDashboard,
  LineChart,
  MessagesSquare,
  Building2,
  Plug,
  FolderKanban,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// `label` is an i18n key (see src/lib/i18n/dictionary.ts); the sidebar translates it.
export const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/performance", label: "nav.performance", icon: LineChart },
  { href: "/integrations", label: "nav.integrations", icon: Plug },
  { href: "/ai-tools", label: "nav.aiTools", icon: Bot },
  { href: "/chat", label: "nav.chat", icon: MessagesSquare },
  { href: "/documents", label: "nav.documents", icon: FileText },
];

export const INTERNAL_NAV: NavItem[] = [
  { href: "/internal", label: "nav.internalHub", icon: Building2 },
  { href: "/internal/team", label: "nav.team", icon: Users },
  { href: "/internal/projects", label: "nav.projects", icon: FolderKanban },
  { href: "/internal/ai-tools", label: "nav.aiPrompts", icon: SlidersHorizontal },
];
