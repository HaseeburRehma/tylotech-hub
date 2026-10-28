import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetLeadSound, armLeadSound, leadSoundEnabled, MIN_GAP_MS, playLeadSound, setLeadSoundEnabled } from "./lead-sound";

// A minimal Web Audio + browser stand-in (tests run in node).
let started = 0;
let unlockable = true; // false = a tab nobody has clicked in: resume() never settles
let ctxCount = 0;
class FakeCtx {
  state: "suspended" | "running" = "suspended";
  destination = {};
  constructor() {
    ctxCount++;
  }
  resume() {
    if (!unlockable) return new Promise(() => {});
    this.state = "running";
    return Promise.resolve();
  }
  addEventListener() {}
  decodeAudioData(_d: ArrayBuffer, ok: (b: unknown) => void) {
    ok({ duration: 1.6 });
  }
  createBufferSource() {
    return { buffer: null, connect: () => {}, start: () => started++ };
  }
  createGain() {
    return { gain: { value: 1 }, connect: () => {} };
  }
}

let store: Record<string, string> = {};
let storageThrows = false;
const listeners = new Map<string, (() => void)[]>();
let fetchOk = true;
const fetchMock = vi.fn(async () => (fetchOk ? { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } : { ok: false, status: 404 }));
const elementPlay = vi.fn(async () => {
  throw new Error("NotAllowedError");
});

beforeEach(() => {
  __resetLeadSound();
  started = 0;
  ctxCount = 0;
  unlockable = true;
  fetchOk = true;
  store = {};
  storageThrows = false;
  listeners.clear();
  fetchMock.mockClear();
  elementPlay.mockClear();
  vi.stubGlobal("window", {
    AudioContext: FakeCtx,
    addEventListener: (e: string, fn: () => void) => listeners.set(e, [...(listeners.get(e) ?? []), fn]),
    removeEventListener: (e: string, fn: () => void) => listeners.set(e, (listeners.get(e) ?? []).filter((f) => f !== fn)),
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => {
      if (storageThrows) throw new Error("SecurityError");
      return store[k] ?? null;
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error("SecurityError");
      store[k] = v;
    },
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "Audio",
    class {
      play = elementPlay;
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("playLeadSound", () => {
  it("rings through Web Audio and downloads the chime only once", async () => {
    expect(await playLeadSound()).toBe(true);
    vi.useFakeTimers({ now: Date.now() + MIN_GAP_MS + 1 });
    expect(await playLeadSound()).toBe(true);
    expect(started).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ctxCount).toBe(1);
  });

  it("a burst of leads rings once, the next lead after the gap rings again", async () => {
    const t0 = Date.now();
    vi.useFakeTimers({ now: t0 });
    const results = await Promise.all(Array.from({ length: 10 }, () => playLeadSound()));
    expect(results.filter(Boolean)).toHaveLength(1);
    vi.setSystemTime(t0 + MIN_GAP_MS + 1);
    expect(await playLeadSound()).toBe(true);
    expect(started).toBe(2);
  });

  it("respects the off switch; the Settings test button plays anyway", async () => {
    setLeadSoundEnabled(false);
    expect(leadSoundEnabled()).toBe(false);
    expect(await playLeadSound()).toBe(false);
    expect(await playLeadSound({ force: true })).toBe(true);
    setLeadSoundEnabled(true);
    expect(await playLeadSound({ force: true })).toBe(true);
    expect(started).toBe(2);
  });

  it("a tab nobody clicked in doesn't hang: it tries the element and reports blocked", async () => {
    unlockable = false;
    const t = Date.now();
    expect(await playLeadSound()).toBe(false);
    expect(Date.now() - t).toBeLessThan(1500);
    expect(elementPlay).toHaveBeenCalledTimes(1);
    expect(started).toBe(0);
  });

  it("a failed download falls back, and the next lead tries the download again", async () => {
    fetchOk = false;
    expect(await playLeadSound({ force: true })).toBe(false);
    fetchOk = true;
    expect(await playLeadSound({ force: true })).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocked storage (private mode) means sound on, and saving never throws", async () => {
    storageThrows = true;
    expect(leadSoundEnabled()).toBe(true);
    expect(() => setLeadSoundEnabled(false)).not.toThrow();
    expect(await playLeadSound()).toBe(true);
  });

  it("without any audio support it fails quietly", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("Audio", undefined);
    expect(await playLeadSound()).toBe(false);
  });
});

describe("armLeadSound", () => {
  it("unlocks on the first click, preloads the chime and stops listening", async () => {
    armLeadSound();
    armLeadSound(); // mounting twice adds nothing
    expect(listeners.get("pointerdown")).toHaveLength(1);
    listeners.get("pointerdown")![0]!();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listeners.get("pointerdown")).toHaveLength(0);
    expect(listeners.get("keydown")).toHaveLength(0);
    expect(await playLeadSound()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
