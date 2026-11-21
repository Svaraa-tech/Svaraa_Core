import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/features/auth/useErrorText';
import { useHousehold } from '@/features/household/store';
import { IconButton, InfoRow, Pill, useMainPalette } from '@/features/main/palette';
import { useWearer } from '@/features/wearer/store';
import { DRAFT_HOUSEHOLD_ID } from '@/services/household/householdApi';
import {
  createReminder,
  deleteReminder,
  listReminders,
  pauseReminder,
  renewReminder,
  resumeReminder,
  updateReminder,
  type Reminder,
  type ReminderRule,
} from '@/services/reminders/remindersApi';
import { Button, Choice, Icon, Input, Text, useTheme } from '@/ui';
import {
  dayOf,
  dayWord,
  fromReminder,
  KINDS,
  MAX_TEXT,
  newDraft,
  patchOf,
  problemOf,
  readRule,
  startOf,
  stepDate,
  stepTime,
  toReminderIn,
  type Draft,
  type Kind,
} from './logic';
import { useReminderSchedule } from './store';

type Screen = { kind: 'list' } | { kind: 'form'; id?: string } | { kind: 'detail'; id: string };

/** Monday first, as the server numbers them (1 = Monday ... 7 = Sunday). */
const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** The household's id once it exists on the server; reminders need an active household. */
function useHouseholdId() {
  const id = useHousehold((s) => s.householdId);
  return id && id !== DRAFT_HOUSEHOLD_ID ? id : undefined;
}

const listKey = (householdId?: string) => ['reminders', householdId];

/** Reminders app: the household's reminders, a form for a new one, one reminder's page, and the phone's schedule. */
export function RemindersView() {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  if (screen.kind === 'form') {
    return <Form id={screen.id} back={(id) => setScreen(id ? { kind: 'detail', id } : { kind: 'list' })} />;
  }
  if (screen.kind === 'detail') {
    return (
      <Detail
        id={screen.id}
        back={() => setScreen({ kind: 'list' })}
        edit={() => setScreen({ kind: 'form', id: screen.id })}
      />
    );
  }
  return <List open={(id) => setScreen({ kind: 'detail', id })} add={() => setScreen({ kind: 'form' })} />;
}

function useFormat() {
  const { i18n, t } = useTranslation();
  const time = (d: Date) =>
    new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(d);
  const clock = (h: number, m: number) => time(new Date(2000, 0, 1, h, m));
  const dayName = (iso: number) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(2024, 0, iso)); // 1 Jan 2024 = Mon
  const date = (d: Date) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  /** "Today", "Tomorrow" or "Thu 20 Nov". */
  const day = (d: Date) => {
    const word = dayWord(d, new Date());
    return word ? t(`reminders.${word}`) : date(d);
  };
  /** "Today, 7:00 PM". */
  const when = (d: Date) => t('reminders.at', { day: day(d), time: time(d) });
  /** How often, in words: "Daily", "Mon, Wed, Fri" or "Every 2 h until 9 PM". */
  const rule = (r: ReminderRule) => {
    if (r.kind === 'days')
      return [...(r.days ?? [])]
        .sort((a, b) => a - b)
        .map(dayName)
        .join(', ');
    if (r.kind === 'interval') {
      const [h, m] = (r.until ?? '21:00').split(':').map(Number);
      return t('reminders.every', { hours: r.every_hours ?? 1, until: clock(h!, m!) });
    }
    return t(`reminders.kind.${r.kind}`);
  };
  return { time, clock, dayName, date, day, when, rule };
}

function useWearerName() {
  const { t } = useTranslation();
  return useWearer((s) => s.profile?.name)?.split(' ')[0] ?? t('reminders.wearerFallback');
}

function useReminderList() {
  const householdId = useHouseholdId();
  const query = useQuery({
    queryKey: listKey(householdId),
    queryFn: () => listReminders(householdId as string),
    enabled: !!householdId,
  });
  return { householdId, ...query };
}

/** After any change: the list again, and (on the wearer's phone) the schedule. */
function useAfterChange() {
  const queryClient = useQueryClient();
  const householdId = useHouseholdId();
  const role = useHousehold((s) => s.role);
  return async () => {
    await queryClient.invalidateQueries({ queryKey: listKey(householdId) });
    if (householdId && role === 'wearer') void useReminderSchedule.getState().sync(householdId, true);
  };
}

function List({ open, add }: { open: (id: string) => void; add: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const f = useFormat();
  const name = useWearerName();
  const errorText = useErrorText();
  const role = useHousehold((s) => s.role);
  const { householdId, data, isPending, isError, error, refetch } = useReminderList();

  if (!householdId) return <Text style={{ color: p.muted }}>{t('reminders.needsSetup')}</Text>;

  const row = (r: Reminder) => {
    const next = r.next_due_at ? new Date(r.next_due_at) : undefined;
    const detail = [next ? f.when(next) : '', f.rule(readRule(r))].filter(Boolean).join(' · ');
    const right =
      r.status === 'paused' ? (
        <Pill label={t('reminders.paused')} tone="warn" />
      ) : next ? (
        <Pill label={f.time(next)} />
      ) : undefined;
    return <InfoRow key={r.id} title={r.text} detail={detail} right={right} onPress={() => open(r.id)} />;
  };

  return (
    <View style={{ gap: theme.space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: p.muted }} accessibilityRole="header">
          {t('reminders.forName', { name })}
        </Text>
        <IconButton icon="plus" label={t('reminders.new')} onPress={add} />
      </View>
      {data ? (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('reminders.count', { used: data.count, limit: data.limit })}
        </Text>
      ) : null}
      {isPending ? <ActivityIndicator color={p.plum} /> : null}
      {isError ? (
        <View style={{ gap: theme.space[2] }}>
          <Text tone="safety" accessibilityRole="alert">
            {errorText(error)}
          </Text>
          <Button label={t('reminders.retry')} variant="secondary" onPress={() => void refetch()} fullWidth />
        </View>
      ) : null}
      {data && !data.items.length ? <Text style={{ color: p.muted }}>{t('reminders.empty')}</Text> : null}
      {data?.items.map(row)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('reminders.new')}
        onPress={add}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 56,
          borderRadius: 15,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: p.line2,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Icon name="plus" size={18} color={p.plum} />
        <Text style={{ color: p.plum, fontWeight: '600' }}>{t('reminders.new')}</Text>
      </Pressable>
      {role === 'wearer' ? <PhoneSchedule householdId={householdId} /> : null}
      <Text style={{ color: p.muted }}>{t('reminders.hint')}</Text>
    </View>
  );
}

/** The wearer's phone: the reminders coming up in the next 48 hours, checked every 5 minutes, and "Check now". */
function PhoneSchedule({ householdId }: { householdId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const f = useFormat();
  const errorText = useErrorText();
  const { items, checkedAt, checking, error } = useReminderSchedule();
  return (
    <View
      style={{
        backgroundColor: p.card,
        borderWidth: 1,
        borderColor: p.line,
        borderRadius: 15,
        padding: 14,
        gap: theme.space[2],
      }}
    >
      <Text variant="kicker" style={{ color: p.gold }}>
        {t('reminders.schedule.title')}
      </Text>
      <Text variant="bodySm" style={{ color: p.muted }} accessibilityLiveRegion="polite">
        {checkedAt
          ? t('reminders.schedule.checked', { time: f.time(new Date(checkedAt)) })
          : t('reminders.schedule.notYet')}
      </Text>
      {items.slice(0, 5).map((i) => (
        <InfoRow key={`${i.reminder_id}-${i.due_at}`} title={i.text} detail={f.when(new Date(i.due_at))} />
      ))}
      {checkedAt && !items.length && !error ? (
        <Text style={{ color: p.muted }}>{t('reminders.schedule.empty')}</Text>
      ) : null}
      {items.length > 5 ? (
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('reminders.schedule.more', { n: items.length - 5 })}
        </Text>
      ) : null}
      {error ? (
        <Text tone="safety" accessibilityRole="alert">
          {errorText(error)}
        </Text>
      ) : null}
      <Button
        label={t('reminders.schedule.check')}
        variant="secondary"
        onPress={() => void useReminderSchedule.getState().sync(householdId, true)}
        loading={checking}
        fullWidth
      />
    </View>
  );
}

export function BackHeader({ title, right, back }: { title: string; right?: string; back: () => void }) {
  const { t } = useTranslation();
  const p = useMainPalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('reminders.back')}
        onPress={back}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, flex: 1 }}
      >
        <Icon name="back" size={20} color={p.muted} />
        <Text
          style={{ color: p.ink, fontWeight: '700', fontSize: 20, flexShrink: 1 }}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </Pressable>
      {right ? <Text style={{ color: p.muted }}>{right}</Text> : null}
    </View>
  );
}

/** An underlined text button (Pause, Renew, Delete). */
export function LinkButton({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const p = useMainPalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
    >
      <Text style={{ color: p.ink, fontWeight: '700', textDecorationLine: 'underline' }}>{label}</Text>
    </Pressable>
  );
}

function Toggle({
  title,
  detail,
  value,
  onChange,
}: {
  title: string;
  detail?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const p = useMainPalette();
  return (
    <InfoRow
      title={title}
      detail={detail}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          accessibilityLabel={title}
          trackColor={{ true: p.good, false: p.line2 }}
        />
      }
    />
  );
}

export function Stepper({
  label,
  value,
  less,
  more,
}: {
  label: string;
  value: string;
  less: () => void;
  more: () => void;
}) {
  const { t } = useTranslation();
  const p = useMainPalette();
  const btn = (text: string, onPress: () => void, name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${name}`}
      onPress={onPress}
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: p.line2,
        backgroundColor: p.card,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: p.plum, fontSize: 22, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {btn('−', less, t('reminders.earlier'))}
      <Text style={{ color: p.ink, fontSize: 18, fontWeight: '600', minWidth: 74, textAlign: 'center' }}>
        {value}
      </Text>
      {btn('+', more, t('reminders.later'))}
    </View>
  );
}

function Form({ id, back }: { id?: string; back: (id?: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const f = useFormat();
  const name = useWearerName();
  const errorText = useErrorText();
  const afterChange = useAfterChange();
  const { householdId, data } = useReminderList();
  const existing = data?.items.find((r) => r.id === id);
  const [before] = useState<Draft | undefined>(() => (existing ? fromReminder(existing) : undefined));
  const [d, setD] = useState<Draft>(() => before ?? newDraft(new Date()));
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const toggleDay = (n: number) =>
    set({ days: d.days.includes(n) ? d.days.filter((x) => x !== n) : [...d.days, n] });

  const timeChanged =
    !before || before.date !== d.date || before.hour !== d.hour || before.minute !== d.minute;
  const problem = problemOf(d, new Date(), timeChanged);

  const save = useMutation({
    mutationFn: async () => {
      if (!householdId) throw new Error('no household');
      if (id && before) return updateReminder(householdId, id, patchOf(before, d));
      return createReminder(householdId, toReminderIn(d));
    },
    onSuccess: async (saved) => {
      await afterChange();
      back(id ? saved.id : undefined);
    },
  });

  const repeating = d.kind !== 'once';
  return (
    <View style={{ gap: theme.space[3] }}>
      <BackHeader
        title={id ? t('reminders.edit') : t('reminders.new')}
        right={t('reminders.forShort', { name })}
        back={() => back(id)}
      />
      <Input
        label={t('reminders.say')}
        hint={t('reminders.sayHint')}
        value={d.text}
        onChangeText={(text) => set({ text })}
        placeholder={t('reminders.sayExample')}
        maxLength={MAX_TEXT}
      />
      <View
        style={{
          backgroundColor: p.tile,
          borderWidth: 1.5,
          borderColor: p.line2,
          borderRadius: 15,
          padding: 14,
          gap: 10,
        }}
      >
        <Text variant="bodySm" style={{ color: p.muted }}>
          {repeating ? t('reminders.firstDay') : t('reminders.date')}
        </Text>
        <Stepper
          label={t('reminders.date')}
          value={f.day(dayOf(d.date))}
          less={() => set({ date: stepDate(d.date, -1, new Date()) })}
          more={() => set({ date: stepDate(d.date, 1, new Date()) })}
        />
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('reminders.time')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <Stepper
            label={t('reminders.hours')}
            value={f.clock(d.hour, d.minute)}
            less={() => set(stepTime(d, -60))}
            more={() => set(stepTime(d, 60))}
          />
          <Stepper
            label={t('reminders.minutes')}
            value={`:${String(d.minute).padStart(2, '0')}`}
            less={() => set(stepTime(d, -5))}
            more={() => set(stepTime(d, 5))}
          />
        </View>
      </View>
      <Text style={{ color: p.muted }}>{t('reminders.timeZone')}</Text>
      <Choice<Kind>
        label={t('reminders.repeatLabel')}
        value={d.kind}
        onChange={(kind) => set({ kind })}
        options={KINDS.map((k) => ({ id: k, label: t(`reminders.kind.${k}`) }))}
      />
      {d.kind === 'interval' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <Stepper
            label={t('reminders.everyLabel')}
            value={t('reminders.everyShort', { hours: d.every })}
            less={() => set({ every: Math.max(1, d.every - 1) })}
            more={() => set({ every: Math.min(12, d.every + 1) })}
          />
          <Stepper
            label={t('reminders.untilLabel')}
            value={f.clock(d.until, 0)}
            less={() => set({ until: Math.max(d.hour + 1, d.until - 1) })}
            more={() => set({ until: Math.min(23, d.until + 1) })}
          />
        </View>
      ) : null}
      {d.kind === 'days' ? (
        <View
          accessibilityRole="menu"
          accessibilityLabel={t('reminders.days')}
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
        >
          {ISO_DAYS.map((n) => {
            const on = d.days.includes(n);
            return (
              <Pressable
                key={n}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggleDay(n)}
                style={{
                  minWidth: 56,
                  minHeight: 48,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: on ? p.plum : p.line2,
                  backgroundColor: on ? p.plumSoft : 'transparent',
                }}
              >
                <Text style={{ color: on ? p.plum : p.ink, fontWeight: '600' }}>{f.dayName(n)}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {repeating ? <Text style={{ color: p.muted }}>{t('reminders.runs90')}</Text> : null}
      <Toggle
        title={t('reminders.persist')}
        detail={t('reminders.persistDetail')}
        value={d.confirm}
        onChange={(confirm) => set({ confirm })}
      />
      <View
        style={{
          backgroundColor: p.card,
          borderWidth: 1,
          borderColor: p.line,
          borderRadius: 15,
          padding: 14,
          gap: 4,
        }}
      >
        <Text style={{ color: p.ink, fontWeight: '700' }}>{t('reminders.preview')}</Text>
        <Text style={{ color: p.muted, fontStyle: 'italic' }}>
          {`“${d.text.trim() || t('reminders.sayExample')}”`}
        </Text>
        <Text variant="bodySm" style={{ color: p.muted }}>
          {t('reminders.firstAt', { when: f.when(startOf(d)) })}
        </Text>
      </View>
      {problem && problem !== 'noText' ? (
        <Text tone="safety" accessibilityRole="alert">
          {t(`reminders.problem.${problem}`)}
        </Text>
      ) : null}
      {save.isError ? (
        <Text tone="safety" accessibilityRole="alert">
          {errorText(save.error)}
        </Text>
      ) : null}
      <Button
        label={t('reminders.save')}
        onPress={() => save.mutate()}
        disabled={!!problem || !householdId}
        loading={save.isPending}
        fullWidth
      />
      <Button label={t('reminders.cancel')} variant="tertiary" onPress={() => back(id)} fullWidth />
    </View>
  );
}

function Detail({ id, back, edit }: { id: string; back: () => void; edit: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const p = useMainPalette();
  const f = useFormat();
  const errorText = useErrorText();
  const afterChange = useAfterChange();
  const { householdId, data } = useReminderList();
  const r = data?.items.find((x) => x.id === id);
  const [sure, setSure] = useState(false);
  const act = useMutation({
    mutationFn: async (action: 'pause' | 'resume' | 'renew' | 'delete') => {
      if (!householdId) throw new Error('no household');
      const run = {
        pause: pauseReminder,
        resume: resumeReminder,
        renew: renewReminder,
        delete: deleteReminder,
      };
      await run[action](householdId, id);
      return action;
    },
    onSuccess: async (action) => {
      await afterChange();
      if (action === 'delete') back();
    },
  });
  // A reminder that ended or was deleted elsewhere is gone from the list: go back to it.
  useEffect(() => {
    if (data && !r && !act.isPending) back();
  }, [data, r, act.isPending, back]);
  if (!r) return null;

  const rule = readRule(r);
  const first = new Date(r.starts_at);
  const next = r.next_due_at ? new Date(r.next_due_at) : undefined;
  const repeating = rule.kind !== 'once';

  return (
    <View style={{ gap: theme.space[3] }}>
      <BackHeader title={r.text} back={back} />
      <InfoRow
        title={t('reminders.nextLabel')}
        detail={r.status === 'paused' ? t('reminders.pausedDetail') : next ? f.when(next) : '—'}
        right={r.status === 'paused' ? <Pill label={t('reminders.paused')} tone="warn" /> : undefined}
      />
      <InfoRow
        title={t('reminders.repeatLabel')}
        detail={
          rule.kind === 'interval'
            ? `${f.time(first)} · ${f.rule(rule)}`
            : `${f.rule(rule)} · ${f.time(first)}`
        }
      />
      {repeating && r.ends_on ? (
        <InfoRow title={t('reminders.endsLabel')} detail={f.date(dayOf(r.ends_on))} />
      ) : null}
      <InfoRow
        title={t('reminders.persist')}
        detail={r.repeat_until_confirmed ? t('reminders.persistDetail') : t('reminders.persistOff')}
      />
      <Text variant="bodySm" style={{ color: p.muted }}>
        {t(`reminders.made.${r.created_via}`)}
      </Text>
      {act.isError ? (
        <Text tone="safety" accessibilityRole="alert">
          {errorText(act.error)}
        </Text>
      ) : null}
      <Button label={t('reminders.editButton')} variant="secondary" onPress={edit} fullWidth />
      {repeating ? (
        <LinkButton label={t('reminders.renew')} onPress={() => act.mutate('renew')} busy={act.isPending} />
      ) : null}
      <LinkButton
        label={r.status === 'paused' ? t('reminders.resume') : t('reminders.pause')}
        onPress={() => act.mutate(r.status === 'paused' ? 'resume' : 'pause')}
        busy={act.isPending}
      />
      <LinkButton
        label={sure ? t('reminders.deleteSure') : t('reminders.delete')}
        onPress={() => (sure ? act.mutate('delete') : setSure(true))}
        busy={act.isPending}
      />
    </View>
  );
}
