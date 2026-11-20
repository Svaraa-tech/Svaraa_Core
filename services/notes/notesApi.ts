import { api, call, type components } from '@/services/api';
import { audioPart } from './audioFile';

type S = components['schemas'];

/**
 * Notes on the real backend (flags.notesApi): the person records a conversation, the server writes it out and makes
 * short notes from it in English and Hindi. Notes are private to the person who recorded them. Needs sign-in.
 */
export type Note = S['NoteOut'];
export type NoteListItem = S['NoteListItemOut'];
export type NoteList = S['NoteListOut'];
export type NoteContent = S['NoteContentOut'];
export type NoteStatus = Note['status'];
export type NoteLanguage = 'en' | 'hi';

/** Notes per page in the list. */
export const NOTES_PAGE_SIZE = 20;
/** How often to ask again while the server works on a note. */
export const NOTE_POLL_MS = 4_000;
/** The server refuses recordings longer than this (`recording_too_long`). */
export const MAX_RECORDING_SECONDS = 2 * 60 * 60;

/** True while the server is still working on the note. */
export const isProcessing = (status: NoteStatus) => status !== 'ready' && status !== 'failed';

/** The note's title: the person's own, else the generated one in `language`, else in the other language. */
export function noteTitle(note: NoteListItem, language: NoteLanguage): string | undefined {
  const other: NoteLanguage = language === 'hi' ? 'en' : 'hi';
  return note.title ?? note.summary?.[language]?.title ?? note.summary?.[other]?.title ?? undefined;
}

/** The notes in `language`, or in the other language when the server made only one. */
export function noteContent(note: NoteListItem, language: NoteLanguage): NoteContent | undefined {
  const other: NoteLanguage = language === 'hi' ? 'en' : 'hi';
  return note.summary?.[language] ?? note.summary?.[other] ?? undefined;
}

/** The signed-in person's notes, newest first, without the transcripts. Pass `next_cursor` for the next page. */
export const listNotes = (cursor?: string): Promise<NoteList> =>
  call(api.GET('/api/v1/notes', { params: { query: { limit: NOTES_PAGE_SIZE, cursor } } }));

/** One note with its transcript. */
export const getNote = (noteId: string): Promise<Note> =>
  call(api.GET('/api/v1/notes/{note_id}', { params: { path: { note_id: noteId } } }));

export type Recording = {
  /** Where the recording is on this phone (or a blob: URL in the browser). */
  uri: string;
  /** e.g. audio/m4a or audio/webm. */
  mimeType: string;
  durationSeconds?: number;
  /** When recording started. */
  recordedAt?: Date;
  title?: string;
};

/** ISO 8601 with this phone's offset, e.g. 2026-11-20T10:00:00+05:30, as the server asks. */
export function withOffset(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/**
 * Upload a recording (at most 50 MB and 2 hours; 20 a day). The server answers at once with the note `queued`;
 * ask for it with getNote every NOTE_POLL_MS until it is `ready` or `failed`.
 */
export async function uploadNote(recording: Recording): Promise<Note> {
  const form = new FormData();
  const audio = await audioPart(recording.uri, recording.mimeType);
  if (audio.value instanceof Blob) form.append('audio', audio.value, audio.name);
  // React Native: the { uri, name, type } object carries its own name.
  else form.append('audio', audio.value as unknown as Blob);
  if (recording.durationSeconds !== undefined)
    form.append('duration_seconds', String(Math.round(recording.durationSeconds * 10) / 10));
  if (recording.recordedAt) form.append('recorded_at', withOffset(recording.recordedAt));
  if (recording.title?.trim()) form.append('title', recording.title.trim());
  return call(
    api.POST('/api/v1/notes', {
      // The typed body describes the form fields; the form itself is sent as multipart/form-data.
      body: {} as S['Body_upload_note_api_v1_notes_post'],
      bodySerializer: () => form,
    }),
  );
}

/** Set the person's own title; null (or blank) goes back to the generated one. */
export const renameNote = (noteId: string, title: string | null): Promise<Note> =>
  call(
    api.PATCH('/api/v1/notes/{note_id}', {
      params: { path: { note_id: noteId } },
      body: { title: title?.trim() || null },
    }),
  );

/** Deletes the transcript and notes at once; the recording goes from storage within minutes. */
export const deleteNote = (noteId: string): Promise<void> =>
  call(api.DELETE('/api/v1/notes/{note_id}', { params: { path: { note_id: noteId } } }));

/** Process a `failed` note again. */
export const retryNote = (noteId: string): Promise<Note> =>
  call(api.POST('/api/v1/notes/{note_id}/retry', { params: { path: { note_id: noteId } } }));
