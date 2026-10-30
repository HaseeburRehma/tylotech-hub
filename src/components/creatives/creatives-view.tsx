"use client";

import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  FolderOpen,
  ImageIcon,
  Images,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CreativeBars } from "@/components/charts/lazy";
import { Button } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { ModalShell } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { humanBytes, type Creative, type CreativeFolder, type CreativeKind, type CreativeSourceProvider, type CreativeSourceView, type MonthCount } from "@/lib/creatives";
import { useIntlLocale, useT } from "@/lib/i18n/provider";
import { APP_TZ, cn } from "@/lib/utils";
import { ConnectModal } from "./connect-modal";
import { duration, fileUrl, Lightbox } from "./lightbox";
import { SourceLogo, SOURCE_NAME } from "./source-logo";
import { UploadModal } from "./upload-modal";

interface Project {
  id: string;
  name: string;
  status: string;
}

export interface CreativesViewProps {
  unavailable: boolean;
  clientId: string | null;
  company: string;
  staff: boolean;
  limit: number | null;
  year: number;
  thisYear: number;
  thisMonth: number;
  months: MonthCount[];
  projects: Project[];
  folders: CreativeFolder[];
  counts: Record<string, number>;
  creatives: Creative[];
  sources: CreativeSourceView[];
  ready: Record<CreativeSourceProvider, boolean>;
  projectId: string | null;
  folderId: string | null;
  flash: string | null;
}

type KindFilter = "all" | CreativeKind;

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

export function CreativesView(p: CreativesViewProps) {
  const t = useT();
  const dl = useIntlLocale();
  const router = useRouter();
  const [projectId, setProjectId] = useState<string | null>(p.projectId ?? p.projects[0]?.id ?? null);
  const [folderId, setFolderId] = useState<string | null>(p.folderId);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(p.flash);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => Promise<void> } | null>(null);
  const [nameEdit, setNameEdit] = useState<{ id: string | null; value: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [dropped, setDropped] = useState<File[]>([]);

  // Keep the place in the URL (shareable, survives refresh) without a server round trip.
  useEffect(() => {
    const u = new URL(window.location.href);
    projectId ? u.searchParams.set("project", projectId) : u.searchParams.delete("project");
    folderId ? u.searchParams.set("folder", folderId) : u.searchParams.delete("folder");
    u.searchParams.delete("source");
    window.history.replaceState(null, "", u.toString());
    setSelected(new Set());
  }, [projectId, folderId]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const project = p.projects.find((x) => x.id === projectId) ?? null;
  const projectFolders = useMemo(() => p.folders.filter((f) => f.project_id === projectId).sort((a, b) => a.position - b.position), [p.folders, projectId]);
  const folder = projectFolders.find((f) => f.id === folderId) ?? null;
  const folderSources = p.sources.filter((s) => s.folder_id === folderId);

  const files = useMemo(() => {
    const q = query.trim().toLowerCase();
    return p.creatives
      .filter((c) => (folder ? c.folder_id === folder.id : c.project_id === projectId))
      .filter((c) => kind === "all" || c.kind === kind)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [p.creatives, folder, projectId, kind, query]);

  const monthLabel = (m: number) => new Date(Date.UTC(2026, m - 1, 15)).toLocaleDateString(dl, { month: "short", timeZone: "UTC" });
  const chart = p.months.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const yearTotal = p.months.reduce((n, m) => n + m.total, 0);
  const current = p.year === p.thisYear ? p.months[p.thisMonth - 1] : null;
  const busiest = p.months.reduce((a, b) => (b.total > a.total ? b : a), p.months[0]);
  const activeMonths = p.months.filter((m) => m.total > 0).length;
  const yearOptions = Array.from({ length: 4 }, (_, i) => String(p.thisYear - i));

  const ok = (text: string) => setToast({ text, tone: "ok" });
  const fail = (e: unknown) => setToast({ text: (e as Error).message, tone: "error" });
  const refresh = () => router.refresh();

  // ---- Team actions ----------------------------------------------------------

  async function saveLimit(value: string) {
    setBusy("limit");
    try {
      await call("/api/creatives/limit", "PATCH", { clientId: p.clientId, limit: value.trim() === "" ? null : Number(value) });
      ok(t("cr.limit.saved"));
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function saveCategory() {
    if (!nameEdit || !projectId) return;
    setBusy("folder");
    try {
      if (nameEdit.id) await call("/api/creatives/folders", "PATCH", { id: nameEdit.id, name: nameEdit.value });
      else {
        const r = await call("/api/creatives/folders", "POST", { projectId, name: nameEdit.value });
        setFolderId(r.folder?.id ?? null);
      }
      setNameEdit(null);
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function askDeleteCategory(f: CreativeFolder) {
    setConfirm({
      title: t("cr.folder.deleteTitle", { name: f.name }),
      body: t("cr.folder.deleteBody"),
      action: async () => {
        await call("/api/creatives/folders", "DELETE", { id: f.id });
        setFolderId(null);
        refresh();
      },
    });
  }

  function askDeleteFiles(ids: string[]) {
    setConfirm({
      title: t("cr.files.deleteTitle", { n: ids.length }),
      body: t("cr.files.deleteBody"),
      action: async () => {
        const r = await call("/api/creatives", "DELETE", { ids });
        setSelected(new Set());
        setViewer(null);
        ok(t("cr.files.deleted", { n: r.deleted ?? ids.length }));
        refresh();
      },
    });
  }

  async function moveFiles(ids: string[], to: string) {
    setBusy("move");
    try {
      const r = await call("/api/creatives", "PATCH", { ids, folderId: to });
      setSelected(new Set());
      ok(t("cr.files.moved", { n: r.moved ?? ids.length }));
      refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function syncSource(s: CreativeSourceView) {
    setBusy(`sync:${s.id}`);
    try {
      const r = await call(`/api/creatives/sources/${s.id}`, "POST", { action: "sync" });
      ok(t("cr.source.synced", { added: r.added ?? 0 }));
      refresh();
    } catch (e) {
      fail(e);
      refresh();
    } finally {
      setBusy(null);
    }
  }

  function askDisconnect(s: CreativeSourceView) {
    setConfirm({
      title: t("cr.source.disconnectTitle", { name: s.label }),
      body: t("cr.source.disconnectBody", { n: s.files, provider: SOURCE_NAME[s.provider] }),
      action: async () => {
        await call(`/api/creatives/sources/${s.id}`, "DELETE");
        refresh();
      },
    });
  }

  // ---- Render ------------------------------------------------------------------

  if (p.unavailable || !p.clientId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("cr.title")} subtitle={t("cr.subtitle", { company: p.company || "" })} />
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <Images className="h-10 w-10 text-muted/60" />
          <p className="max-w-md text-sm text-muted">{p.unavailable ? t("cr.unavailable") : t("cr.noPartner")}</p>
        </Card>
      </div>
    );
  }

  const sinceText = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(dl, { timeZone: APP_TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : t("cr.source.never");

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const flashTone = flash === "connected" ? "ok" : "error";

  return (
    <div className="space-y-6">
      <PageHeader title={t("cr.title")} subtitle={t("cr.subtitle", { company: p.company })}>
        {p.staff && (
          <>
            <Button variant="secondary" onClick={() => setConnectOpen(true)} disabled={!folder}>
              <Cloud className="h-4 w-4" />
              {t("cr.connect.button")}
            </Button>
            <Button onClick={() => (setDropped([]), setUploadOpen(true))} disabled={!p.projects.length}>
              <UploadCloud className="h-4 w-4" />
              {t("cr.upload.button")}
            </Button>
          </>
        )}
      </PageHeader>

      {flash && (
        <div className={cn("flex items-start gap-3 rounded-xl px-4 py-3 text-sm", flashTone === "ok" ? "bg-success/10 text-foreground" : "bg-danger/10 text-danger")}>
          {flashTone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : null}
          <p className="flex-1">{t(`cr.flash.${flash}`)}</p>
          <button type="button" onClick={() => setFlash(null)} aria-label={t("common.close")} className="rounded p-0.5 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Creatives over time */}
      <Panel>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">{t("cr.chart.title")}</h2>
            <p className="mt-1 max-w-2xl text-caption leading-relaxed text-muted">{t("cr.chart.desc")}</p>
          </div>
          <div className="w-28 shrink-0">
            <Select value={String(p.year)} onChange={(y) => router.push(`?${new URLSearchParams({ ...(projectId ? { project: projectId } : {}), ...(folderId ? { folder: folderId } : {}), year: y })}`)} options={yearOptions.map((y) => ({ value: y, label: y }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <Stat
            label={current ? t("cr.stat.month") : t("cr.stat.peak")}
            value={(current ?? busiest).total}
            suffix={p.limit ? `/ ${p.limit.toLocaleString()}` : undefined}
            bar={p.limit ? Math.min(1, (current ?? busiest).total / p.limit) : undefined}
            over={!!p.limit && (current ?? busiest).total > p.limit}
            note={current ? undefined : monthLabel(busiest.month)}
          />
          <Stat label={t("cr.stat.year", { year: p.year })} value={yearTotal} note={activeMonths ? t("cr.stat.avg", { n: Math.round(yearTotal / activeMonths) }) : undefined} />
          <Stat label={t("cr.stat.images")} value={p.months.reduce((n, m) => n + m.images, 0)} icon={<ImageIcon className="h-3.5 w-3.5" />} />
          <Stat label={t("cr.stat.videos")} value={p.months.reduce((n, m) => n + m.videos, 0)} icon={<Video className="h-3.5 w-3.5" />} />
        </div>
        <div className="px-3 pb-3 pt-4 sm:px-5">
          <CreativeBars data={chart} limit={p.limit} labels={{ creatives: t("cr.chart.creatives"), images: t("cr.chart.images"), videos: t("cr.chart.videos"), documents: t("cr.chart.pdfs"), limit: t("cr.chart.limit") }} />
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 text-caption text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-brand" /> {t("cr.chart.creatives")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-danger" /> {p.limit ? t("cr.chart.limitLegend", { n: p.limit.toLocaleString() }) : t("cr.chart.noLimit")}
            </span>
            {p.staff && <LimitEditor value={p.limit} saving={busy === "limit"} onSave={saveLimit} />}
          </div>
        </div>
      </Panel>

      {/* Library */}
      {p.projects.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-14 text-center">
          <FolderOpen className="h-10 w-10 text-muted/60" />
          <p className="max-w-md text-sm text-muted">{t("cr.noProjects")}</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Folder tree (desktop) */}
          <Panel className="hidden self-start lg:block">
            <nav aria-label={t("cr.tree")} className="max-h-[70vh] overflow-y-auto p-2">
              {p.projects.map((pr) => {
                const open = pr.id === projectId;
                const n = p.folders.filter((f) => f.project_id === pr.id).reduce((s, f) => s + (p.counts[f.id] ?? 0), 0);
                return (
                  <div key={pr.id} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setProjectId(pr.id);
                        setFolderId(null);
                      }}
                      className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2", open && !folderId && "bg-brand/[0.08] font-medium")}
                    >
                      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted transition-transform", open && "rotate-90")} />
                      <span className="min-w-0 flex-1 truncate">{pr.name}</span>
                      <span className="font-mono text-eyebrow text-muted">{n}</span>
                    </button>
                    {open && (
                      <div className="ml-4 border-l border-line pl-2">
                        <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-eyebrow font-medium uppercase tracking-wide text-muted">
                          <Folder className="h-3 w-3" /> {t("cr.creativesFolder")}
                        </p>
                        {projectFolders.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setFolderId(f.id)}
                            className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-surface-2", f.id === folderId && "bg-brand/[0.08] font-medium text-foreground")}
                          >
                            {f.id === folderId ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-brand-ink" /> : <Folder className="h-3.5 w-3.5 shrink-0 text-muted" />}
                            <span className="min-w-0 flex-1 truncate">{f.name}</span>
                            {p.sources.some((s) => s.folder_id === f.id) && <Cloud className="h-3 w-3 shrink-0 text-muted" />}
                            <span className="font-mono text-eyebrow text-muted">{p.counts[f.id] ?? 0}</span>
                          </button>
                        ))}
                        {p.staff && (
                          <button type="button" onClick={() => setNameEdit({ id: null, value: "" })} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-foreground">
                            <Plus className="h-3.5 w-3.5" /> {t("cr.folder.new")}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </Panel>

          <Panel
            className="relative min-w-0"
            onDragOver={(e) => {
              if (!p.staff || !Array.from(e.dataTransfer.types).includes("Files")) return;
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
            onDrop={(e) => {
              if (!p.staff) return;
              e.preventDefault();
              setDrag(false);
              setDropped(Array.from(e.dataTransfer.files));
              setUploadOpen(true);
            }}
          >
            {/* Phone: pick project and category */}
            <div className="grid grid-cols-1 gap-2 border-b border-line p-3 lg:hidden">
              <Select
                value={projectId ?? ""}
                onChange={(v) => {
                  setProjectId(v);
                  setFolderId(null);
                }}
                options={p.projects.map((x) => ({ value: x.id, label: x.name }))}
              />
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
                <Chip active={!folderId} onClick={() => setFolderId(null)}>
                  {t("cr.allCategories")}
                </Chip>
                {projectFolders.map((f) => (
                  <Chip key={f.id} active={f.id === folderId} onClick={() => setFolderId(f.id)}>
                    {f.name} <span className="ml-1 font-mono text-eyebrow opacity-70">{p.counts[f.id] ?? 0}</span>
                  </Chip>
                ))}
              </div>
            </div>

            {/* Breadcrumb + tools */}
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 sm:px-5">
              <nav aria-label={t("cr.path")} className="flex min-w-0 flex-1 items-center gap-1 text-sm">
                <button type="button" onClick={() => setFolderId(null)} className={cn("truncate hover:text-foreground", folder ? "text-muted" : "font-medium")}>
                  {project?.name}
                </button>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                <button type="button" onClick={() => setFolderId(null)} className={cn("shrink-0 hover:text-foreground", folder ? "text-muted" : "font-medium")}>
                  {t("cr.creativesFolder")}
                </button>
                {folder && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate font-medium">{folder.name}</span>
                  </>
                )}
              </nav>
              {folder && p.staff && (
                <Menu
                  align="end"
                  trigger={({ toggle }) => (
                    <button type="button" onClick={toggle} aria-label={t("cr.folder.menu")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground">
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem icon={<Pencil className="h-3.5 w-3.5" />} onSelect={() => (close(), setNameEdit({ id: folder.id, value: folder.name }))}>
                        {t("cr.folder.rename")}
                      </MenuItem>
                      <MenuItem icon={<Cloud className="h-3.5 w-3.5" />} onSelect={() => (close(), setConnectOpen(true))}>
                        {t("cr.connect.button")}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger icon={<Trash2 className="h-3.5 w-3.5" />} onSelect={() => (close(), askDeleteCategory(folder))}>
                        {t("cr.folder.delete")}
                      </MenuItem>
                    </>
                  )}
                </Menu>
              )}
            </div>

            {folder && folderSources.length > 0 && (
              <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
                {folderSources.map((s) => (
                  <div key={s.id} className={cn("flex min-w-0 max-w-full items-center gap-2.5 rounded-xl border px-3 py-2", s.status === "error" ? "border-danger/40 bg-danger/[0.05]" : "border-line")}>
                    <SourceLogo provider={s.provider} size={24} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{s.label}</p>
                      <p className={cn("truncate text-caption", s.status === "error" ? "text-danger" : "text-muted")}>
                        {s.status === "error" && s.last_error ? s.last_error : t("cr.source.meta", { n: s.files, when: sinceText(s.last_synced_at) })}
                        {s.account ? ` · ${s.account}` : ""}
                      </p>
                    </div>
                    {p.staff && (
                      <div className="ml-1 flex shrink-0 items-center">
                        <button type="button" onClick={() => syncSource(s)} disabled={busy === `sync:${s.id}`} title={t("cr.source.sync")} aria-label={t("cr.source.sync")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-50">
                          <RefreshCw className={cn("h-3.5 w-3.5", busy === `sync:${s.id}` && "animate-spin")} />
                        </button>
                        <button type="button" onClick={() => askDisconnect(s)} title={t("cr.source.disconnect")} aria-label={t("cr.source.disconnect")} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!folder ? (
              <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3">
                {projectFolders.map((f) => {
                  const inside = p.creatives.filter((c) => c.folder_id === f.id);
                  const covers = inside.filter((c) => c.kind === "image" || c.source !== "upload").slice(0, 4);
                  return (
                    <button key={f.id} type="button" onClick={() => setFolderId(f.id)} className="group overflow-hidden rounded-2xl border border-line text-left transition-colors hover:border-brand/50">
                      <div className="grid aspect-[16/9] grid-cols-2 grid-rows-2 gap-px bg-line">
                        {covers.length ? (
                          covers.map((c, i) => (
                            <div key={c.id} className={cn("relative overflow-hidden bg-surface-2", covers.length === 1 && "col-span-2 row-span-2", covers.length === 2 && "row-span-2", covers.length === 3 && i === 0 && "row-span-2")}>
                              <Thumb c={c} />
                            </div>
                          ))
                        ) : (
                          <div className="col-span-2 row-span-2 flex items-center justify-center bg-surface-2/60">
                            <Folder className="h-9 w-9 text-muted/50" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-3.5 py-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium group-hover:text-foreground">{f.name}</span>
                          <span className="block text-caption text-muted">{t("cr.files.count", { n: p.counts[f.id] ?? 0 })}</span>
                        </span>
                        {Array.from(new Set(p.sources.filter((s) => s.folder_id === f.id).map((s) => s.provider))).map((pv) => (
                          <SourceLogo key={pv} provider={pv} size={20} />
                        ))}
                      </div>
                    </button>
                  );
                })}
                {p.staff && (
                  <button type="button" onClick={() => setNameEdit({ id: null, value: "" })} className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm text-muted transition-colors hover:border-brand/50 hover:text-foreground">
                    <Plus className="h-5 w-5" /> {t("cr.folder.new")}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 px-4 pt-4 sm:flex-row sm:items-center sm:px-5">
                  <div className="relative sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("cr.search")} className="h-9 pl-9" aria-label={t("cr.search")} />
                  </div>
                  <Segmented<KindFilter>
                    value={kind}
                    onChange={setKind}
                    options={[
                      { key: "all", label: t("cr.kind.all") },
                      { key: "image", label: t("cr.kind.image") },
                      { key: "video", label: t("cr.kind.video") },
                      { key: "document", label: t("cr.kind.document") },
                    ]}
                  />
                </div>

                {p.staff && selected.size > 0 && (
                  <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm sm:mx-5">
                    <span className="font-medium">{t("cr.selected", { n: selected.size })}</span>
                    <div className="w-48">
                      <Select
                        value=""
                        placeholder={t("cr.moveTo")}
                        onChange={(to) => moveFiles(Array.from(selected), to)}
                        disabled={busy === "move"}
                        options={p.folders
                          .filter((f) => f.id !== folderId)
                          .map((f) => ({ value: f.id, label: `${p.projects.find((x) => x.id === f.project_id)?.name ?? ""} / ${f.name}` }))}
                      />
                    </div>
                    <Button variant="danger" size="sm" onClick={() => askDeleteFiles(Array.from(selected))}>
                      <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
                    </Button>
                    <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-caption text-muted hover:text-foreground">
                      {t("cr.clearSelection")}
                    </button>
                  </div>
                )}

                {files.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                    <Images className="h-10 w-10 text-muted/50" />
                    <p className="max-w-sm text-sm text-muted">{query || kind !== "all" ? t("cr.empty.filtered") : p.staff ? t("cr.empty.staff") : t("cr.empty.client")}</p>
                    {p.staff && !query && kind === "all" && (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button size="sm" onClick={() => setUploadOpen(true)}>
                          <UploadCloud className="h-4 w-4" /> {t("cr.upload.button")}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setConnectOpen(true)}>
                          <Cloud className="h-4 w-4" /> {t("cr.connect.button")}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:p-5 xl:grid-cols-4 2xl:grid-cols-5">
                    {files.map((c, i) => {
                      const sel = selected.has(c.id);
                      return (
                        <li key={c.id} className="group relative">
                          <button
                            type="button"
                            onClick={() => (selected.size ? (c.source === "upload" ? toggle(c.id) : null) : setViewer(i))}
                            className={cn("block w-full overflow-hidden rounded-xl border text-left transition-all hover:shadow-card", sel ? "border-brand ring-2 ring-brand/40" : "border-line")}
                          >
                            <div className="relative aspect-square bg-surface-2">
                              <Thumb c={c} />
                              {c.kind === "video" && (
                                <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                  <Play className="h-2.5 w-2.5 fill-current" />
                                  {duration(c.duration_sec)}
                                </span>
                              )}
                              {c.source !== "upload" && <SourceLogo provider={c.source} size={18} className="absolute right-1.5 top-1.5" />}
                            </div>
                            <div className="px-2.5 py-2">
                              <p className="truncate text-caption font-medium text-foreground" title={c.name}>
                                {c.name}
                              </p>
                              <p className="truncate text-[11px] text-muted">
                                {[new Date(c.created_at).toLocaleDateString(dl, { timeZone: APP_TZ, day: "numeric", month: "short" }), c.width && c.height ? `${c.width}×${c.height}` : "", humanBytes(c.size_bytes)].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                          </button>
                          {p.staff && c.source === "upload" && (
                            <label className={cn("absolute left-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-white/90 shadow ring-1 ring-black/10 transition-opacity", sel || selected.size ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}>
                              <input type="checkbox" checked={sel} onChange={() => toggle(c.id)} className="h-3.5 w-3.5 accent-[rgb(var(--brand))]" aria-label={t("cr.select", { name: c.name })} />
                            </label>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {drag && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-brand bg-brand/[0.08] text-sm font-medium text-brand-ink">
                <UploadCloud className="mr-2 h-5 w-5" /> {t("cr.dropHere")}
              </div>
            )}
          </Panel>
        </div>
      )}

      {viewer !== null && files[viewer] && <Lightbox items={files} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} onDelete={p.staff ? (c) => askDeleteFiles([c.id]) : undefined} />}

      {p.staff && (
        <>
          <UploadModal
            open={uploadOpen}
            onClose={() => (setUploadOpen(false), setDropped([]))}
            projects={p.projects}
            folders={p.folders}
            projectId={projectId}
            folderId={folderId}
            initialFiles={dropped}
            onDone={(n) => {
              ok(t("cr.upload.toast", { n }));
              refresh();
            }}
          />
          <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} folderId={folder?.id ?? null} categoryLabel={folder ? `${project?.name ?? ""} / ${folder.name}` : ""} ready={p.ready} />
        </>
      )}

      <ModalShell open={!!nameEdit} onClose={() => setNameEdit(null)} className="max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCategory();
          }}
          className="space-y-4 p-6"
        >
          <h2 className="font-display text-lg font-semibold">{nameEdit?.id ? t("cr.folder.rename") : t("cr.folder.new")}</h2>
          <Input value={nameEdit?.value ?? ""} onChange={(e) => setNameEdit((s) => (s ? { ...s, value: e.target.value } : s))} maxLength={80} placeholder={t("cr.folder.placeholder")} autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNameEdit(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={busy === "folder"} disabled={!nameEdit?.value.trim()}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell open={!!confirm} onClose={() => setConfirm(null)} className="max-w-sm">
        <div className="space-y-3 p-6">
          <h2 className="font-display text-lg font-semibold">{confirm?.title}</h2>
          <p className="text-body-sm text-muted">{confirm?.body}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              loading={busy === "confirm"}
              onClick={async () => {
                if (!confirm) return;
                setBusy("confirm");
                try {
                  await confirm.action();
                  setConfirm(null);
                } catch (e) {
                  fail(e);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {t("cr.confirm")}
            </Button>
          </div>
        </div>
      </ModalShell>

      {toast && (
        <div role="status" className={cn("fixed bottom-5 left-1/2 z-[95] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm shadow-float", toast.tone === "ok" ? "bg-foreground text-background" : "bg-danger text-white")}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, suffix, note, bar, over, icon }: { label: string; value: number; suffix?: string; note?: string; bar?: number; over?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4">
      <p className="flex items-center gap-1.5 text-caption text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
        <span className={cn(over && "text-danger")}>{value.toLocaleString()}</span>
        {suffix && <span className="ml-1 text-sm font-medium text-muted">{suffix}</span>}
      </p>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div className={cn("h-full rounded-full", over ? "bg-danger" : "bg-brand")} style={{ width: `${Math.max(2, bar * 100)}%` }} />
        </div>
      )}
      {note && <p className="mt-1 text-caption text-muted">{note}</p>}
    </div>
  );
}

function LimitEditor({ value, saving, onSave }: { value: number | null; saving: boolean; onSave: (v: string) => void }) {
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value ? String(value) : "");
  if (!edit) {
    return (
      <button type="button" onClick={() => (setV(value ? String(value) : ""), setEdit(true))} className="ml-auto inline-flex items-center gap-1 font-medium text-brand-ink hover:underline">
        <Pencil className="h-3 w-3" /> {value ? t("cr.limit.change") : t("cr.limit.set")}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
        setEdit(false);
      }}
      className="ml-auto flex items-center gap-1.5"
    >
      <label className="sr-only" htmlFor="cr-limit">
        {t("cr.limit.label")}
      </label>
      <Input id="cr-limit" type="number" min={1} max={100000} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder={t("cr.limit.none")} className="h-8 w-28 text-sm" autoFocus />
      <Button type="submit" size="sm" className="h-8" loading={saving}>
        {t("common.save")}
      </Button>
      <button type="button" onClick={() => setEdit(false)} className="rounded p-1 text-muted hover:text-foreground" aria-label={t("common.cancel")}>
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-caption transition-colors", active ? "border-brand bg-brand/[0.1] font-medium text-foreground" : "border-line text-muted hover:text-foreground")}>
      {children}
    </button>
  );
}

/** Grid preview: images and cloud files by thumbnail, uploaded videos by their first frame once on screen. */
function Thumb({ c }: { c: Creative }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (c.kind !== "video" || c.source !== "upload" || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setVisible(true), io.disconnect()), { rootMargin: "200px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [c.kind, c.source]);

  if (broken || (c.kind === "document" && c.source === "upload")) {
    const Icon = c.kind === "video" ? Video : c.kind === "document" ? FileText : ImageIcon;
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Icon className="h-8 w-8 text-muted/60" />
      </div>
    );
  }
  if (c.kind === "video" && c.source === "upload") {
    return <video ref={ref} src={visible ? `${fileUrl(c.id)}#t=0.5` : undefined} muted playsInline preload="metadata" onError={() => setBroken(true)} className="h-full w-full object-cover" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={fileUrl(c.id, "thumb=1")} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="h-full w-full object-cover" />;
}
