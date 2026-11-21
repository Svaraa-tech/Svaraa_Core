/**
 * What an alert does besides the banner. This file is the phone version and does nothing: phones will use the
 * system's own alarms (see docs/open-items.md). The browser version is alertOutput.web.ts.
 */
export function prepareAlerts(): () => void {
  return () => undefined;
}

/** Sound and notify. `title` and `text` are already translated. */
export function ringAlert(_title: string, _text: string): void {}
