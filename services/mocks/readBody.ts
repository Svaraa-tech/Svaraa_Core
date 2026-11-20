/**
 * A request's body for the mock routes: JSON, or the fields of a multipart form (a file field becomes
 * `{ name, type }`; the file itself is not read).
 */
export async function readBody(request: Request): Promise<unknown> {
  if (request.method === 'GET') return undefined;
  // React Native's fetch keeps the FormData as it was given and cannot read it back as text.
  const native = (request as unknown as { _bodyFormData?: FormData })._bodyFormData;
  const type = request.headers.get('content-type') ?? '';
  if (native || type.includes('multipart/form-data')) {
    const form = (native ?? (await request.formData().catch(() => undefined))) as FormData | undefined;
    return form ? fieldsOf(form) : undefined;
  }
  return request.json().catch(() => undefined);
}

type Part = { fieldName: string; string?: string; name?: string; type?: string };

function fieldsOf(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const parts = (form as unknown as { getParts?: () => Part[] }).getParts?.();
  if (parts) {
    for (const p of parts) out[p.fieldName] = p.string ?? { name: p.name, type: p.type };
    return out;
  }
  form.forEach((value, key) => {
    out[key] = typeof value === 'string' ? value : { name: value.name, type: value.type };
  });
  return out;
}
