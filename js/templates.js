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

- {signature}`
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

- {signature}`
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

- {signature}`
  }
};

DEFAULT_TEMPLATES.material = {
  label: 'New material shared',
  vars: ['student', 'title', 'subject', 'type', 'description', 'link'],
  text:
`Assalamu Alaikum,

New {type} for {student}:
{title}
Subject: {subject}
{description}
Open it on {student}'s dashboard:
{link}

- {signature}`
};
DEFAULT_TEMPLATES.nanoExam = {
  label: 'New Nano exam',
  vars: ['student', 'title', 'questions', 'minutes', 'points', 'examLink', 'link'],
  text:
`Assalamu Alaikum,

A new Nano exam is ready for {student}:
{title}
Questions: {questions} · Time: {minutes} min
Exam link: {examLink}

Dashboard: {link}

- {signature}`
};
DEFAULT_TEMPLATES.offlineResult = {
  label: 'Offline exam result',
  vars: ['student', 'title', 'subject', 'mcq', 'written', 'total', 'full', 'percent', 'link'],
  text:
`Assalamu Alaikum,

Exam result of {student}
{title} ({subject})
{mcq}{written}Total: {total} / {full} ({percent}%)

Progress: {link}

- {signature}`
};

export const TEMPLATE_KEYS = Object.keys(DEFAULT_TEMPLATES);
