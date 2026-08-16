import { mkdir, writeFile } from 'node:fs/promises';

const calendarId = process.env.GOOGLE_CALENDAR_ID || '99103ae0ebe950eba5285a04ecff368ecf5970d7931d4493fc28c146983a3138@group.calendar.google.com';
const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
const outputPath = new URL('../assets/data/quinta-availability.json', import.meta.url);

const response = await fetch(calendarUrl);
if (!response.ok) throw new Error(`Google Calendar returned ${response.status}`);

const source = (await response.text()).replace(/\r?\n[ \t]/g, '');
const events = [...source.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)].map(match => match[1]);

const property = (event, name) => {
  const line = event.split(/\r?\n/).find(value => value === name || value.startsWith(`${name}:`) || value.startsWith(`${name};`));
  if (!line) return null;
  const separator = line.indexOf(':');
  return separator < 0 ? null : { meta: line.slice(0, separator), value: line.slice(separator + 1) };
};

const isoDate = value => {
  const match = value?.match(/^(\d{4})(\d{2})(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

const addDays = (date, amount) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
};

const busy = events.flatMap(event => {
  if (property(event, 'STATUS')?.value === 'CANCELLED') return [];
  const startProperty = property(event, 'DTSTART');
  const endProperty = property(event, 'DTEND');
  const start = isoDate(startProperty?.value);
  let end = isoDate(endProperty?.value);
  if (!start) return [];

  const allDay = startProperty?.meta.includes('VALUE=DATE');
  if (!end) end = addDays(start, 1);
  if (!allDay) {
    const endHasTime = /T\d{6}/.test(endProperty?.value || '');
    if (end <= start) end = addDays(start, 1);
    else if (endHasTime && !/T000000/.test(endProperty.value)) end = addDays(end, 1);
  }
  if (end <= start) end = addDays(start, 1);
  return [{ start, end }];
});

const uniqueBusy = [...new Map(busy.map(range => [`${range.start}:${range.end}`, range])).values()]
  .sort((a, b) => a.start.localeCompare(b.start));

await mkdir(new URL('../assets/data/', import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({ updatedAt: new Date().toISOString(), busy: uniqueBusy }, null, 2)}\n`, 'utf8');

