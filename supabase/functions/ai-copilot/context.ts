export type Period = { from: string; to: string; label: string };
const iso = (date: Date) => date.toISOString().slice(0, 10);
const shift = (date: string, days: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000));

export function businessClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const year = Number(get('year')), month = Number(get('month'));
  const start = `${get('year')}-${get('month')}-01`;
  const week = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const periods: Record<string, Period> = {
    today: { from: today, to: today, label: 'Today' },
    yesterday: { from: shift(today, -1), to: shift(today, -1), label: 'Yesterday' },
    this_week: { from: week, to: today, label: 'This week so far' },
    last_week: { from: shift(week, -7), to: shift(week, -1), label: 'Last full week' },
    this_month: { from: start, to: today, label: 'This month so far' },
    last_month: { from: iso(new Date(Date.UTC(year, month - 2, 1))), to: shift(start, -1), label: 'Last full month' },
    this_year: { from: `${year}-01-01`, to: today, label: 'This year so far' },
    last_year: { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: 'Last full year' },
    last_7_days: { from: shift(today, -6), to: today, label: 'Last 7 days, including today' },
    last_30_days: { from: shift(today, -29), to: today, label: 'Last 30 days, including today' },
  };
  return { today, timeZone: 'Asia/Kolkata', checkedAt: now.toISOString(), periods };
}

export function requestedPeriods(message: string, clock = businessClock()): Period[] {
  const patterns: Record<string, RegExp> = {
    last_month: /last (?:full |calendar )?month|previous month|കഴിഞ്ഞ മാസം|kazhinja masam|last month/i,
    this_month: /this month|current month|ഈ മാസം|ee masam/i,
    last_week: /last week|previous week|കഴിഞ്ഞ ആഴ്ച|kazhinja aazhcha/i,
    this_week: /this week|ഈ ആഴ്ച|ee aazhcha/i,
    yesterday: /yesterday|ഇന്നലെ|innale/i,
    today: /\btoday\b|ഇന്ന്|\binnu\b/i,
    last_year: /last year|previous year|കഴിഞ്ഞ വർഷം/i,
    this_year: /this year|current year|ഈ വർഷം/i,
    last_7_days: /last (?:7|seven) days/i,
    last_30_days: /last (?:30|thirty) days/i,
  };
  return Object.entries(patterns).filter(([, pattern]) => pattern.test(message)).map(([key]) => clock.periods[key]);
}

export function reportPeriod(raw: Record<string, unknown>, clock = businessClock(), requested: Period[] = []): Period {
  const named = typeof raw.period === 'string' ? clock.periods[raw.period] : undefined;
  const from = named?.from ?? String(raw.from ?? '');
  const to = named?.to ?? String(raw.to ?? '');
  // The latest user's relative range is authoritative, even if an old chat contains wrong dates.
  if (requested.length === 1) return requested[0];
  for (const value of [from, to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || iso(new Date(`${value}T00:00:00Z`)) !== value) throw new Error('Use a valid YYYY-MM-DD date range or a named period.');
  }
  if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new Error('Choose a date range of at most 366 days.');
  if (requested.length > 1 && !requested.some(period => period.from === from && period.to === to)) throw new Error('Use one of the date ranges resolved from the latest question.');
  return named ?? { from, to, label: `${from} to ${to}` };
}

export function summarizeExpenses(rows: Record<string, unknown>[], period: Period) {
  const cents = { approved: 0, pending: 0, rejected: 0 };
  const categories: Record<string, number> = {};
  for (const row of rows) {
    const amount = Math.round(Number(row.amount) * 100);
    if (!Number.isFinite(amount)) throw new Error('An expense amount could not be read.');
    if (!(String(row.status) in cents)) throw new Error('An expense status could not be read.');
    cents[row.status as keyof typeof cents] += amount;
    if (row.status === 'approved') categories[String(row.category)] = (categories[String(row.category)] ?? 0) + amount;
  }
  return { ...period, dateBasis: 'expense_date', count: rows.length, approved: cents.approved / 100, pending: cents.pending / 100, rejected: cents.rejected / 100,
    categories: Object.entries(categories).map(([category, amount]) => ({ category, amount: amount / 100 })),
    recent: rows.slice(-10).reverse(), complete: true };
}

export function expenseAnswer(message: string, report: ReturnType<typeof summarizeExpenses>): string | null {
  const words = new Set('what is was are were the total amount of expenses expense in for last full calendar month this current previous week today yesterday year how much did we i spend spent spending show me tell during please'.split(' '));
  if (!message.toLowerCase().split(/\W+/).filter(Boolean).every(word => words.has(word))) return null;
  if (!/expense|spend|spent/i.test(message) || /compare|why|trend|versus|\bvs\b|revenue|withdraw|income|profit|wallet|meta|\bads?\b|food|travel|internet|equipment|miscellaneous|rejected|pending|only/i.test(message) || !/total|how much|amount/i.test(message) || /[\u0d00-\u0d7f]/.test(message)) return null;
  const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
  const categories = report.categories.map(item => `- ${item.category.replaceAll('_', ' ')}: **${money(item.amount)}**`).join('\n');
  return `**Approved expenses: ${money(report.approved)}**\n\n${report.label}: **${report.from} to ${report.to}** (India time). Based on expense dates.\n\n${categories || 'No approved expenses were recorded for these dates.'}\n\nPending approval: **${money(report.pending)}**. Rejected: **${money(report.rejected)}**.\n\n_Checked live expense records. Pending and rejected amounts are excluded from the approved total; wallet deductions can occur on a different date._`;
}

export function readableAnswer(content: string, question: string) {
  if (/\buuid\b|\b(?:proof|payment|order|record|customer)\s+ids?\b/i.test(question)) return content;
  const dash = '[-\\u2010-\\u2015]';
  const uuid = `[a-f\\d]{8}${dash}[a-f\\d]{4}${dash}[a-f\\d]{4}${dash}[a-f\\d]{4}${dash}[a-f\\d]{12}`;
  return content
    .replace(new RegExp(`(?:[–-]\\s*)?(?:proof|payment|order|record|customer|track|service)\\s+(?:id|uuid)\\s*[:：]?\\s*\u0060?${uuid}\u0060?`, 'gi'), '')
    .replace(new RegExp(`(?<![=/])\u0060?${uuid}\u0060?`, 'gi'), 'internal record')
    .replace(/[ \t]+[–-][ \t]*(?=\n|$)/g, '');
}
