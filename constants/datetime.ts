import { getLocales, getCalendars } from 'expo-localization';
import { Locale } from './i18n';

const JS_LOCALE: Record<Locale, string> = {
  es: 'es-ES',
  en: 'en-US',
  fr: 'fr-FR',
  pt: 'pt-BR',
  ca: 'ca-ES',
};

// Locales that use 24h clock by default
const USES_24H: Partial<Record<Locale, boolean>> = {
  es: true, fr: true, pt: true, ca: true, en: false,
};

export function getDeviceLocale(): Locale {
  try {
    const locales = getLocales();
    const lang = (locales[0]?.languageCode ?? 'en').toLowerCase();
    if (lang === 'es') return 'es';
    if (lang === 'fr') return 'fr';
    if (lang === 'pt') return 'pt';
    if (lang === 'ca') return 'ca';
    return 'en';
  } catch {
    return 'en';
  }
}

export function getDeviceTimezone(): string {
  try {
    const calendars = getCalendars();
    return calendars[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  }
}

export function use24h(): boolean {
  try {
    const calendars = getCalendars();
    const uses24h = calendars[0]?.uses24hourClock;
    if (uses24h !== null && uses24h !== undefined) return uses24h;
  } catch {}
  return USES_24H[getDeviceLocale()] ?? false;
}

export function formatMatchTime(kickoff: number, locale: Locale): string {
  const tz = getDeviceTimezone();
  const hour12 = !use24h();
  const jsLocale = JS_LOCALE[locale] ?? 'en-US';
  const d = new Date(kickoff);

  const datePart = d.toLocaleDateString(jsLocale, {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: tz,
  });
  const timePart = d.toLocaleTimeString(jsLocale, {
    hour: '2-digit', minute: '2-digit', hour12, timeZone: tz,
  });

  // Timezone abbreviation
  const tzAbbr = d.toLocaleTimeString('en-US', {
    timeZone: tz, timeZoneName: 'short',
  }).split(' ').pop() ?? '';

  return `${datePart} · ${timePart} ${tzAbbr}`;
}

export function formatDateGroup(kickoff: number, locale: Locale): string {
  const tz = getDeviceTimezone();
  const jsLocale = JS_LOCALE[locale] ?? 'en-US';
  const d = new Date(kickoff);
  const str = d.toLocaleDateString(jsLocale, {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: tz,
  });
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function dayKey(kickoff: number): string {
  const tz = getDeviceTimezone();
  const d = new Date(kickoff);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const p: Record<string, string> = {};
  parts.forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}

export function todayKey(): string {
  return dayKey(Date.now());
}

export function tomorrowKey(): string {
  return dayKey(Date.now() + 86400000);
}
