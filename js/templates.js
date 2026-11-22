// Default WhatsApp messages. The teacher can edit every one of them in Settings.
// {placeholders} are filled in automatically. {teacher} is always available.
export const DEFAULT_TEMPLATES = {
  welcome: {
    label: 'Welcome / dashboard link',
    vars: ['student', 'class', 'link'],
    text:
`Assalamu Alaikum,

{student}'s personal learning dashboard is ready. Attendance, study materials and results will be here.

Class: {class}
Dashboard link (private, please don't share):
{link}

- {teacher}`
  },
  monthStart: {
    label: 'New month started',
    vars: ['student', 'class', 'month', 'startDate', 'link'],
    text:
`Assalamu Alaikum,

Student: {student}
Month {month} has started.
Start date: {startDate}
Class: {class}

Dashboard: {link}

- {teacher}`
  },
  monthEnd: {
    label: 'Month ended (summary)',
    vars: ['student', 'class', 'month', 'startDate', 'endDate', 'total', 'dates', 'link'],
    text:
`Assalamu Alaikum,

Student: {student}
Month {month} has ended.
Start: {startDate}
End: {endDate}
Total classes: {total}
Dates: {dates}

Dashboard: {link}

- {teacher}`
  }
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);
