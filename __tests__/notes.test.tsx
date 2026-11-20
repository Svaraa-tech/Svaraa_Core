import { act, fireEvent, screen } from '@testing-library/react-native';
import i18n from '@/i18n';
import { NotesView } from '@/features/notes/NotesView';
import { verifyOtpAndSignIn } from '@/services/auth/authApi';
import { DEMO_CODE } from '@/services/mocks/routes';
import {
  deleteNote,
  getNote,
  listNotes,
  noteContent,
  noteTitle,
  renameNote,
  retryNote,
  uploadNote,
  withOffset,
  type Recording,
} from '@/services/notes/notesApi';
import { INDIA, requests, useMockBackend } from '@/test-utils/backend';
import { renderApp } from '@/test-utils/render';

// The microphone: a stand-in that "records" 1 minute 5 seconds.
jest.mock('@/services/notes/recorder', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react') as typeof import('react');
  return {
    useNoteRecorder: () => {
      const [recording, setRecording] = React.useState(false);
      return {
        available: true,
        recording,
        seconds: recording ? 65 : 0,
        start: async () => {
          setRecording(true);
          return 'started';
        },
        stop: async () => {
          setRecording(false);
          return {
            uri: 'file:///note.m4a',
            mimeType: 'audio/m4a',
            durationSeconds: 65,
            recordedAt: new Date(),
          };
        },
        cancel: async () => setRecording(false),
      };
    },
  };
});

const recording = (patch: Partial<Recording> = {}): Recording => ({
  uri: 'file:///note.m4a',
  mimeType: 'audio/m4a',
  durationSeconds: 30,
  recordedAt: new Date(2026, 10, 20, 10, 0),
  ...patch,
});

/** Upload and read the note until the mock has made its notes. */
async function readyNote(patch: Partial<Recording> = {}) {
  const note = await uploadNote(recording(patch));
  for (let i = 0; i < 3; i++) await getNote(note.id);
  return getNote(note.id);
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  await useMockBackend();
  await verifyOtpAndSignIn(INDIA, DEMO_CODE);
});

describe('Notes API', () => {
  it('uploads a recording and follows it from queued to ready notes in English and Hindi', async () => {
    const note = await uploadNote(recording({ title: '  ' }));
    expect(note).toMatchObject({ status: 'queued', title: null, duration_seconds: 30 });
    expect(note.recorded_at).toMatch(/^2026-11-20T10:00:00[+-]\d\d:\d\d$/);
    expect((await getNote(note.id)).status).toBe('transcribing');
    expect((await getNote(note.id)).status).toBe('summarizing');
    const ready = await getNote(note.id);
    expect(ready.status).toBe('ready');
    expect(noteTitle(ready, 'en')).toBe("Mother's doctor visit");
    expect(noteTitle(ready, 'hi')).toBe('माँ की डॉक्टर से मुलाक़ात');
    expect(noteContent(ready, 'en')?.action_items[0]).toMatchObject({ owner: 'Ravi' });
    expect(ready.utterances?.length).toBeGreaterThan(0);
  });

  it('renames, lists newest first, and deletes', async () => {
    const first = await readyNote();
    const second = await uploadNote(recording());
    expect((await renameNote(first.id, 'Doctor visit')).title).toBe('Doctor visit');
    expect(noteTitle(await getNote(first.id), 'hi')).toBe('Doctor visit'); // the person's own title wins
    expect((await renameNote(first.id, null)).title).toBeNull();
    const list = await listNotes();
    expect(list.items.map((n) => n.id)).toEqual([second.id, first.id]);
    expect(list).toMatchObject({ daily_limit: 20, next_cursor: null });
    await deleteNote(first.id);
    await expect(getNote(first.id)).rejects.toMatchObject({ code: 'note_not_found' });
  });

  it('tries a failed note again, and refuses a note that did not fail', async () => {
    const note = await uploadNote(recording({ durationSeconds: 0.5 })); // the mock hears "no speech"
    await getNote(note.id);
    const failed = await getNote(note.id);
    expect(failed).toMatchObject({ status: 'failed', error: { code: 'no_speech' } });
    expect((await retryNote(note.id)).status).toBe('queued');
    for (let i = 0; i < 3; i++) await getNote(note.id);
    expect((await getNote(note.id)).status).toBe('ready');
    await expect(retryNote(note.id)).rejects.toMatchObject({ code: 'note_not_failed' });
  });

  it('refuses a recording over 2 hours and more than 20 a day', async () => {
    await expect(uploadNote(recording({ durationSeconds: 3 * 3600 }))).rejects.toMatchObject({
      code: 'recording_too_long',
    });
    for (let i = 0; i < 20; i++) await uploadNote(recording());
    await expect(uploadNote(recording())).rejects.toMatchObject({ code: 'notes_daily_limit_reached' });
  });

  it('sends the time with the phone offset', () => {
    expect(withOffset(new Date(2026, 0, 2, 3, 4, 5))).toMatch(/^2026-01-02T03:04:05[+-]\d\d:\d\d$/);
  });
});

describe('Notes app', () => {
  it('records only after everyone agrees, then uploads and shows the note being made', async () => {
    await renderApp(<NotesView />);
    expect(await screen.findByText('No notes yet. Record your first one.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Record a note' }));
    const start = screen.getByRole('button', { name: 'Start recording' });
    expect(start.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'Everyone being recorded has agreed to it.' }),
    );
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Start recording' })));
    expect(screen.getByText('1:05')).toBeTruthy();
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Stop and save' })));
    expect(requests.some((r) => r.method === 'POST' && r.path.endsWith('/notes'))).toBe(true);
    expect(
      await screen.findByText(/Waiting to start|Writing out what was said|Making the notes/),
    ).toBeTruthy();
  });

  it('shows a ready note in both languages, its transcript, and deletes it', async () => {
    await readyNote();
    await renderApp(<NotesView />);
    expect(await screen.findByText('1 of 20 recordings today')).toBeTruthy();
    await fireEvent.press(await screen.findByText("Mother's doctor visit"));
    expect(await screen.findByText('• Ravi will drive Mother to the doctor')).toBeTruthy();
    expect(screen.getByText('• Take Mother to the doctor — Ravi, tomorrow 10 am')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'हिंदी' }));
    expect(await screen.findByText('• रवि माँ को डॉक्टर के पास ले जाएँगे')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show what was said' }));
    expect(screen.getByText('Speaker 2: I will drive her there.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete note' }));
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Tap again to delete' })));
    expect(await screen.findByText('No notes yet. Record your first one.')).toBeTruthy();
  });

  it('says why a note failed and tries it again', async () => {
    const note = await uploadNote(recording({ durationSeconds: 0.5 }));
    await getNote(note.id);
    await getNote(note.id);
    await renderApp(<NotesView />);
    await fireEvent.press(await screen.findByText('New note'));
    expect(await screen.findByText('No one could be heard in this recording.')).toBeTruthy();
    await act(async () => await fireEvent.press(screen.getByRole('button', { name: 'Try again' })));
    expect(requests.some((r) => r.path.endsWith('/retry'))).toBe(true);
  });
});
