/**
 * The new-lead chime in the browser (the same sound the TyloHQ app rings with).
 *
 * Browsers only allow sound after the person has clicked or typed in the tab,
 * so `armLeadSound()` unlocks one shared AudioContext on the first gesture and
 * preloads the chime; from then on it rings even while the tab is in the
 * background. The on/off choice is per device (localStorage).
 */

export const LEAD_SOUND_SRC = "/sounds/new-lead.mp3";
const PREF_KEY = "tylohq.leadSound";
/** A burst of leads (bulk import, several forms at once) rings once, not ten times. */
export const MIN_GAP_MS = 2500;
/** A context that was never unlocked keeps resume() pending forever; don't wait on it. */
const RESUME_WAIT_MS = 300;

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let buffer: AudioBuffer | null = null;
let loading: Promise<AudioBuffer | null> | null = null;
let lastPlayed = 0;
let armed = false;

export function leadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLeadSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // Private mode / storage blocked: the switch just won't stick.
  }
}

function context(): Ctx | null {
  if (ctx) return ctx;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    ctx = new C();
  } catch {
    return null;
  }
  return ctx;
}

function load(c: Ctx): Promise<AudioBuffer | null> {
  if (buffer) return Promise.resolve(buffer);
  loading ??= fetch(LEAD_SOUND_SRC)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`chime ${r.status}`))))
    // Callback form: older Safari has no promise-returning decodeAudioData.
    .then((data) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(data, res, rej)))
    .then((b) => (buffer = b))
    .catch(() => {
      loading = null; // try again next time
      return null;
    });
  return loading;
}

async function running(c: Ctx): Promise<boolean> {
  if (c.state === "running") return true;
  await Promise.race([c.resume().catch(() => {}), new Promise((r) => setTimeout(r, RESUME_WAIT_MS))]);
  return (c.state as string) === "running";
}

/** Unlock audio on the first click / key / tap in this tab (call once on mount). */
export function armLeadSound() {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const events = ["pointerdown", "keydown", "touchend"] as const;
  const unlock = () => {
    const c = context();
    if (!c) return done();
    void c.resume().catch(() => {});
    void load(c);
    if (c.state === "running") done();
    else c.addEventListener?.("statechange", () => c.state === "running" && done(), { once: true });
  };
  const done = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
}

/**
 * Ring the chime. Returns whether it played. `force` (the Settings test button)
 * ignores the off switch and the burst limit.
 */
export async function playLeadSound({ force = false }: { force?: boolean } = {}): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!force && !leadSoundEnabled()) return false;
  const now = Date.now();
  if (!force && now - lastPlayed < MIN_GAP_MS) return false;
  lastPlayed = now;

  const c = context();
  if (c && (await running(c))) {
    const b = await load(c);
    if (b) {
      const src = c.createBufferSource();
      const gain = c.createGain();
      gain.gain.value = 0.9;
      src.buffer = b;
      src.connect(gain);
      gain.connect(c.destination);
      src.start();
      return true;
    }
  }
  // No Web Audio, or not unlocked yet: a plain element plays where the site may autoplay.
  try {
    await new Audio(LEAD_SOUND_SRC).play();
    return true;
  } catch {
    return false; // blocked until the first click; the alert card is still on screen
  }
}

/** Tests only. */
export function __resetLeadSound() {
  ctx = null;
  buffer = null;
  loading = null;
  lastPlayed = 0;
  armed = false;
}
