import type { components } from '@/services/api/schema';
import { newId, notesOf, type MockNote } from './db';

type S = components['schemas'];

/** Same limits as the server. */
export const NOTES_DAILY_LIMIT = 20;
const MAX_SECONDS = 2 * 60 * 60;
/** Demo hook: a recording shorter than this "has no speech", so the failed state and Try again can be seen. */
export const NO_SPEECH_SECONDS = 1;

type Problem = { status: number; code: string; details?: Record<string, unknown> };
type Out<T> = T | Problem;

const ORDER: S['NoteOut']['status'][] = ['queued', 'transcribing', 'summarizing', 'ready'];

/** Sample notes, as the server would write them for a short family call. */
const SAMPLE: S['NoteSummaryOut'] = {
  en: {
    title: "Mother's doctor visit",
    summary:
      "The family planned Mother's blood pressure check tomorrow morning. Ravi will drive, and groceries are needed by Friday.",
    key_points: ['Blood pressure check is due', 'Milk and fruit are running low'],
    decisions: ['Ravi will drive Mother to the doctor'],
    action_items: [
      { text: 'Take Mother to the doctor', owner: 'Ravi', due: 'tomorrow 10 am' },
      { text: 'Buy milk and fruit', owner: null, due: 'Friday evening' },
    ],
  },
  hi: {
    title: 'माँ की डॉक्टर से मुलाक़ात',
    summary: 'परिवार ने कल सुबह माँ की ब्लड प्रेशर जाँच तय की। रवि गाड़ी चलाएँगे, और शुक्रवार तक राशन चाहिए।',
    key_points: ['ब्लड प्रेशर की जाँच होनी है', 'दूध और फल ख़त्म हो रहे हैं'],
    decisions: ['रवि माँ को डॉक्टर के पास ले जाएँगे'],
    action_items: [
      { text: 'माँ को डॉक्टर के पास ले जाना', owner: 'रवि', due: 'कल सुबह 10 बजे' },
      { text: 'दूध और फल ख़रीदना', owner: null, due: 'शुक्रवार शाम' },
    ],
  },
};
const TRANSCRIPT = [
  { speaker: 0, start: 0, end: 6.5, text: 'Tomorrow at ten, Mother has her blood pressure check.' },
  { speaker: 1, start: 6.5, end: 10, text: 'I will drive her there.' },
  { speaker: 0, start: 10, end: 14, text: 'Good. We also need milk and fruit by Friday evening.' },
];

const today = (iso: string) => iso.slice(0, 10);
const listItem = (n: MockNote): S['NoteListItemOut'] => {
  const {
    reads: _reads,
    willFail: _willFail,
    transcript: _t,
    utterances: _u,
    audio_available: _a,
    ...item
  } = n;
  return item;
};
const noteOut = (n: MockNote): S['NoteOut'] => {
  const { reads: _reads, willFail: _willFail, ...out } = n;
  return out;
};

/** POST /notes. `body` holds the form fields; the audio itself is not kept. */
export function upload(userId: string, body: unknown): Out<S['NoteOut']> {
  const form = (body ?? {}) as Record<string, unknown>;
  if (form.audio === undefined) return { status: 422, code: 'validation_error' };
  const seconds = form.duration_seconds === undefined ? undefined : Number(form.duration_seconds);
  if (seconds !== undefined && seconds > MAX_SECONDS) return { status: 422, code: 'recording_too_long' };
  const notes = notesOf(userId);
  const now = new Date().toISOString();
  if (notes.filter((n) => today(n.created_at) === today(now)).length >= NOTES_DAILY_LIMIT)
    return { status: 429, code: 'notes_daily_limit_reached', details: { limit: NOTES_DAILY_LIMIT } };
  const title = typeof form.title === 'string' && form.title.trim() ? form.title.trim() : null;
  const note: MockNote = {
    id: newId(),
    status: 'queued',
    title,
    summary: null,
    recorded_at: typeof form.recorded_at === 'string' ? form.recorded_at : null,
    duration_seconds: seconds ?? null,
    languages: [],
    error: null,
    created_at: now,
    completed_at: null,
    transcript: null,
    utterances: null,
    audio_available: true,
    reads: 0,
    willFail: seconds !== undefined && seconds < NO_SPEECH_SECONDS,
  };
  notes.unshift(note);
  return noteOut(note);
}

/** Each read moves the note one step on (queued, transcribing, summarizing, ready), so the app's polling shows them. */
function advance(n: MockNote): void {
  if (n.status === 'ready' || n.status === 'failed') return;
  n.reads += 1;
  if (n.willFail && n.status === 'transcribing') {
    n.status = 'failed';
    n.error = { code: 'no_speech', message: 'No speech was heard in the recording' };
    return;
  }
  n.status = ORDER[ORDER.indexOf(n.status) + 1] ?? 'ready';
  if (n.status !== 'ready') return;
  n.error = null;
  n.summary = SAMPLE;
  n.languages = ['en', 'hi'];
  n.transcript = TRANSCRIPT.map((u) => `Speaker ${u.speaker + 1}: ${u.text}`).join('\n');
  n.utterances = TRANSCRIPT;
  n.completed_at = new Date().toISOString();
}

const find = (userId: string, id: string) => notesOf(userId).find((n) => n.id === id);
const notFound: Problem = { status: 404, code: 'note_not_found' };

export function get(userId: string, id: string): Out<S['NoteOut']> {
  const n = find(userId, id);
  if (!n) return notFound;
  advance(n);
  return noteOut(n);
}

/** GET /notes: newest first; the cursor is the index of the next note. Reading the list moves notes on too. */
export function list(userId: string, query: URLSearchParams | undefined): S['NoteListOut'] {
  const limit = Math.min(100, Math.max(1, Number(query?.get('limit')) || 20));
  const from = Math.max(0, Number(query?.get('cursor')) || 0);
  const all = notesOf(userId);
  const items = all.slice(from, from + limit).map((n) => {
    advance(n);
    return listItem(n);
  });
  return {
    items,
    next_cursor: from + limit < all.length ? String(from + limit) : null,
    daily_limit: NOTES_DAILY_LIMIT,
  };
}

export function rename(userId: string, id: string, body: unknown): Out<S['NoteOut']> {
  const n = find(userId, id);
  if (!n) return notFound;
  const title = (body as Partial<S['NoteTitleIn']> | undefined)?.title;
  n.title = typeof title === 'string' && title.trim() ? title.trim() : null;
  return noteOut(n);
}

export function remove(userId: string, id: string): Out<true> {
  const notes = notesOf(userId);
  const at = notes.findIndex((n) => n.id === id);
  if (at < 0) return notFound;
  notes.splice(at, 1);
  return true;
}

/** Only a failed note; it goes back to `queued` with its error kept, and this time succeeds. */
export function retry(userId: string, id: string): Out<S['NoteOut']> {
  const n = find(userId, id);
  if (!n) return notFound;
  if (n.status !== 'failed') return { status: 409, code: 'note_not_failed' };
  n.status = 'queued';
  n.willFail = false;
  return noteOut(n);
}
