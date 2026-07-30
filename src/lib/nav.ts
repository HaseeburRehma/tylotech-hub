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
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export const CLIENT_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/performance", label: "Performance", icon: LineChart },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/ai-tools", label: "AI Tools", icon: Bot },
  { href: "/chat", label: "Chat & Updates", icon: MessagesSquare, badge: "2" },
  { href: "/documents", label: "Documents", icon: FileText },
];

export const INTERNAL_NAV: NavItem[] = [
  { href: "/internal", label: "Internal Hub", icon: Building2 },
  { href: "/internal/projects", label: "Projects", icon: FolderKanban },
  { href: "/internal/ai-tools", label: "AI Prompts", icon: SlidersHorizontal },
];
