import { extensionOf } from './audioType';

/** The recording as a form field, in the browser: the file itself, read from its blob: URL. */
export async function audioPart(uri: string, mimeType: string): Promise<{ value: Blob; name: string }> {
  const blob = await (await fetch(uri)).blob();
  return { value: blob, name: `note.${extensionOf(blob.type || mimeType)}` };
}
