/** The few browser parts used here, so no DOM types are needed. */
interface Param {
  setValueAtTime: (v: number, t: number) => void;
  linearRampToValueAtTime: (v: number, t: number) => void;
  exponentialRampToValueAtTime: (v: number, t: number) => void;
}
interface Node_ {
  connect: (n: Node_) => void;
}
type Done = Promise<void>;
interface Ctx {
  currentTime: number;
  destination: Node_;
  state: string;
  resume: () => Done;
  createOscillator: () => Node_ & {
    type: string;
    frequency: Param;
    start: (t: number) => void;
    stop: (t: number) => void;
  };
  createGain: () => Node_ & { gain: Param };
}
type BrowserNotification = {
  permission: string;
  new (title: string, options?: { body?: string; tag?: string }): unknown;
};

const BEEP_HZ = 880;
const BEEP_SECONDS = 0.4;

let ctx: Ctx | undefined;
const audio = (): Ctx | undefined => {
  if (ctx) return ctx;
  const g = globalThis as unknown as { AudioContext?: new () => Ctx; webkitAudioContext?: new () => Ctx };
  const Make = g.AudioContext ?? g.webkitAudioContext;
  return Make ? (ctx = new Make()) : undefined;
};

/** Browsers keep sound off until the person has touched the page, so the first touch unlocks it. */
export function prepareAlerts(): () => void {
  const doc = (
    globalThis as unknown as { document?: { addEventListener: Function; removeEventListener: Function } }
  ).document;
  if (!doc) return () => undefined;
  const unlock = () =>
    void audio()
      ?.resume()
      .catch(() => undefined);
  const events = ['pointerdown', 'keydown', 'touchstart'];
  events.forEach((e) => doc.addEventListener(e, unlock, { passive: true }));
  return () => events.forEach((e) => doc.removeEventListener(e, unlock));
}

/** One short beep. */
function beep() {
  const c = audio();
  if (!c) return;
  void c.resume().catch(() => undefined);
  const at = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(BEEP_HZ, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.linearRampToValueAtTime(0.4, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + BEEP_SECONDS);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(at);
  osc.stop(at + BEEP_SECONDS + 0.05);
}

/** One beep and, if the person allowed it, a browser notification. The banner on the page is shown either way. */
export function ringAlert(title: string, text: string): void {
  try {
    beep();
  } catch {
    /* no sound available: the banner still shows */
  }
  try {
    const N = (globalThis as unknown as { Notification?: BrowserNotification }).Notification;
    if (N?.permission === 'granted') new N(title, { body: text, tag: 'svaraa-reminder' });
  } catch {
    /* notifications blocked: the banner still shows */
  }
}
