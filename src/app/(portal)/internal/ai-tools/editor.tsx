"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import type { AiToolRow } from "@/lib/data";

function ToolRow({ tool }: { tool: AiToolRow }) {
  const [prompt, setPrompt] = useState(tool.prompt_template ?? "");
  const [active, setActive] = useState(tool.is_active);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(nextActive = active) {
    setState("saving");
    setError(null);
    const res = await fetch("/api/ai-tools", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: tool.slug, prompt_template: prompt, is_active: nextActive }),
    }).catch(() => null);
    if (!res?.ok) {
      const d = res ? await res.json().catch(() => ({})) : {};
      setError(d.error ?? "Could not save.");
      setState("error");
      return;
    }
    setState("saved");
    setTimeout(() => setState("idle"), 2000);
  }

  return (
    <Card className="p-5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{tool.name}</CardTitle>
          <Badge variant="outline">{tool.category}</Badge>
          {!active && <Badge variant="warning">Disabled</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {state === "saved" && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => {
                setActive(e.target.checked);
                save(e.target.checked);
              }}
              className="h-4 w-4 accent-[rgb(var(--brand))]"
            />
            Active
          </label>
        </div>
      </CardHeader>
      {tool.description && <p className="mb-2 text-xs text-muted">{tool.description}</p>}
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <label className="mb-1.5 block text-xs font-medium text-muted">System prompt (what Claude is instructed to do)</label>
      <Textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="min-h-[120px] font-mono text-xs"
        placeholder="You are a senior copywriter…"
      />
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={() => save()} loading={state === "saving"}>
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save prompt
        </Button>
      </div>
    </Card>
  );
}

export function AiToolsEditor({ tools }: { tools: AiToolRow[] }) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Tool Prompts"
        subtitle="Edit the system prompt behind each Claude-powered tool. Changes apply instantly to every client."
      />
      {tools.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">
          No AI tools found. Run the ai_tools seed to populate them.
        </Card>
      ) : (
        <div className="space-y-4">
          {tools.map((t) => (
            <ToolRow key={t.id} tool={t} />
          ))}
        </div>
      )}
    </div>
  );
}
