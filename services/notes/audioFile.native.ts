import { extensionOf } from './audioType';

/**
 * The recording as a form field, on the phone: React Native's FormData sends the file at `uri` itself when given
 * `{ uri, name, type }`, so the recording is never read into memory.
 */
export async function audioPart(
  uri: string,
  mimeType: string,
): Promise<{ value: { uri: string; name: string; type: string }; name: string }> {
  const name = `note.${extensionOf(mimeType)}`;
  return { value: { uri, name, type: mimeType }, name };
}
