import { randomUUID } from "node:crypto";

/**
 * A small in-memory stand-in for the Supabase admin client, for route tests
 * that need real filtering, uniqueness and storage rather than canned answers.
 * Supports the query shapes the app uses: select/eq/neq/in/order/limit,
 * maybeSingle/single, insert, upsert (onConflict, ignoreDuplicates), update,
 * delete, rpc, and storage list/remove/signed links.
 */
type Row = Record<string, any>;

export function fakeDb(seed: Record<string, Row[]> = {}, opts: { unique?: Record<string, string[][]>; rpc?: Record<string, (args: any, t: Record<string, Row[]>) => any> } = {}) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  const objects = new Map<string, { size: number; mimetype: string }>();
  const removed: string[] = [];
  const signedUploads: string[] = [];

  const clash = (name: string, row: Row, ignore?: Row) =>
    (opts.unique?.[name] ?? []).some((cols) =>
      (tables[name] ?? []).some((r) => r !== ignore && cols.every((c) => r[c] != null && String(r[c]).toLowerCase() === String(row[c]).toLowerCase())),
    );

  function from(name: string) {
    const rows = () => (tables[name] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
    let payload: any;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let limitN: number | null = null;
    let offset = 0;
    let order: [string, boolean] | null = null;

    async function exec(): Promise<{ data: any; error: any }> {
      const match = (r: Row) => filters.every((f) => f(r));
      if (op === "select") {
        let out = rows().filter(match);
        if (order) {
          const [k, asc] = order;
          out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1));
        }
        if (limitN != null || offset) out = out.slice(offset, limitN != null ? offset + limitN : undefined);
        return { data: out.map((r) => ({ ...r })), error: null };
      }
      if (op === "insert") {
        const list = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }));
        for (const r of list) if (clash(name, r)) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        rows().push(...list);
        return { data: list.map((r: Row) => ({ ...r })), error: null };
      }
      if (op === "upsert") {
        const cols = (upsertOpts.onConflict ?? "id").split(",").map((s) => s.trim());
        const out: Row[] = [];
        for (const r of Array.isArray(payload) ? payload : [payload]) {
          const hit = rows().find((x) => cols.every((c) => x[c] != null && x[c] === r[c]));
          if (hit) {
            if (!upsertOpts.ignoreDuplicates) {
              Object.assign(hit, r);
              out.push({ ...hit });
            }
          } else {
            const row = { id: randomUUID(), created_at: new Date().toISOString(), ...r };
            rows().push(row);
            out.push({ ...row });
          }
        }
        return { data: out, error: null };
      }
      if (op === "update") {
        const hit = rows().filter(match);
        for (const r of hit) {
          if (clash(name, { ...r, ...payload }, r)) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
          Object.assign(r, payload);
        }
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      const keep = rows().filter((r) => !match(r));
      const gone = rows().filter(match);
      tables[name] = keep;
      return { data: gone, error: null };
    }

    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), b),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), b),
      like: (k: string, pattern: string) => {
        const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`);
        return filters.push((r) => re.test(String(r[k] ?? ""))), b;
      },
      not: (k: string, op: string, v: unknown) => (filters.push((r) => (op === "is" && v === null ? r[k] != null : r[k] !== v)), b),
      order: (k: string, o?: { ascending?: boolean }) => ((order = [k, o?.ascending !== false]), b),
      limit: (n: number) => ((limitN = n), b),
      range: (from: number, to: number) => ((offset = from), (limitN = to - from + 1), b),
      insert: (p: any) => ((op = "insert"), (payload = p), b),
      upsert: (p: any, o: any = {}) => ((op = "upsert"), (payload = p), (upsertOpts = o), b),
      update: (p: any) => ((op = "update"), (payload = p), b),
      delete: () => ((op = "delete"), b),
      maybeSingle: () => exec().then((r) => ({ ...r, data: Array.isArray(r.data) ? r.data[0] ?? null : r.data })),
      single: () => exec().then((r) => (r.error ? r : { data: r.data?.[0] ?? null, error: r.data?.length ? null : { message: "no rows" } })),
      then: (res: any, rej: any) => exec().then(res, rej),
    };
    return b;
  }

  const storage = {
    from: () => ({
      createSignedUploadUrl: async (path: string) => (signedUploads.push(path), { data: { token: `tok-${signedUploads.length}`, path }, error: null }),
      createSignedUrl: async (path: string, ttl: number, o?: { download?: string }) => ({ data: { signedUrl: `https://store.example/${path}?ttl=${ttl}${o?.download ? "&download=1" : ""}` }, error: null }),
      list: async (dir: string, o: { search?: string } = {}) => ({
        data: Array.from(objects.entries())
          .filter(([p]) => p.startsWith(dir + "/") && !p.slice(dir.length + 1).includes("/") && (!o.search || p.includes(o.search)))
          .map(([p, m]) => ({ name: p.slice(dir.length + 1), metadata: m })),
        error: null,
      }),
      upload: async (path: string, data: Uint8Array, o: { contentType?: string } = {}) => (objects.set(path, { size: data.length, mimetype: o.contentType ?? "" }), { data: { path }, error: null }),
      remove: async (paths: string[]) => (removed.push(...paths), paths.forEach((p) => objects.delete(p)), { data: [], error: null }),
    }),
  };

  const client: any = {
    from,
    storage,
    rpc: async (fn: string, args: any) => ({ data: opts.rpc?.[fn]?.(args, tables) ?? [], error: null }),
  };
  return { client, tables, objects, removed, signedUploads };
}
