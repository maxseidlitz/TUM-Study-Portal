const { z } = require('zod');

const id = z.string().trim().min(1).max(240);
const compositeSafeId = id.refine(value => !value.includes('::'), {
  message: 'ID must not contain the reserved "::" separator',
});
const short = z.string().max(240);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}, { message: 'Invalid calendar date' });
const clockTime = z.string().regex(/^\d{2}:\d{2}$/).refine((value) => {
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}, { message: 'Invalid clock time' });
const date = z.union([z.literal(''), isoDate]);
const time = z.union([z.literal(''), clockTime]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

function validTimeRange(value, context) {
  if (value.allDay) return;
  if (value.time && value.end_time && value.time >= value.end_time) {
    context.addIssue({ code: 'custom', path: ['end_time'], message: 'End time must be after start time' });
  }
}

const exam = z.object({
  id,
  name: z.string().trim().min(1).max(240),
  date,
  time: time.optional().default(''),
  room: z.string().max(200).optional().default(''),
  credits: z.number().int().min(0).max(60).nullable().optional(),
  notes: z.string().max(10000).optional().default(''),
  grade: z.number().min(1).max(5).optional(),
  passed: z.boolean().optional(),
});

const todo = z.object({
  id,
  title: z.string().trim().min(1).max(240),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  subject: z.string().max(240).optional().default(''),
  due: date.optional().default(''),
  notes: z.string().max(10000).optional().default(''),
  done: z.boolean().optional().default(false),
  moduleId: id.or(z.literal('')).optional().default(''),
  moodleCourseId: id.or(z.literal('')).optional().default(''),
});

const aiCreateTodo = z.object({
  title: z.string().trim().min(1).max(240),
  priority: z.enum(['high', 'medium', 'low']).optional().default('medium'),
  subject: z.string().max(240).optional().default(''),
  due: date.optional().default(''),
  notes: z.string().max(10000).optional().default(''),
  moduleId: id.or(z.literal('')).optional().default(''),
  moodleCourseId: id.or(z.literal('')).optional().default(''),
}).strict();

const moodle = z.object({
  id,
  name: z.string().trim().min(1).max(240),
  code: short.optional(),
  semester: short.optional(),
  url: z.string().max(2048).optional(),
  color: color.optional(),
});

const slot = z.object({
  id: compositeSafeId,
  day: z.enum(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']),
  time: time.optional().default(''),
  end_time: time.optional().default(''),
  room: z.string().max(240).optional().default(''),
  lecturer: z.string().max(240).optional().default(''),
  allDay: z.boolean().optional().default(false),
  overrides: z.record(isoDate, z.object({
    canceled: z.boolean().optional(),
    time: time.optional(),
    end_time: time.optional(),
    room: z.string().max(240).optional(),
  }).superRefine(validTimeRange)).optional(),
}).superRefine((value, context) => {
  validTimeRange(value, context);
  if (value.overrides && Object.keys(value.overrides).length > 750) {
    context.addIssue({ code: 'custom', path: ['overrides'], message: 'Too many slot overrides' });
  }
});

const moduleSchema = z.object({
  id: compositeSafeId,
  name: z.string().trim().min(1).max(240),
  code: short.optional().default(''),
  semester: short.optional().default(''),
  moodleUrl: z.string().max(2048).optional().default(''),
  color: color.optional().default('#3B82F6'),
  source: z.string().max(40).optional(),
  slots: z.array(slot).max(500).optional().default([]),
}).refine(value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 256 * 1024, {
  message: 'Serialized module exceeds 256 KiB',
});

const lectureShape = {
  id,
  name: z.string().max(240).optional().default(''),
  day: z.enum(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']).optional(),
  time: time.optional().default(''),
  end_time: time.optional().default(''),
  room: z.string().max(240).optional().default(''),
  lecturer: z.string().max(240).optional().default(''),
  color: color.optional(),
  eventDate: date.optional().default(''),
  allDay: z.boolean().optional().default(false),
  imported: z.boolean().optional(),
  icalUid: z.string().max(500).optional(),
  moduleId: id.or(z.literal('')).optional(),
};
const lecture = z.object(lectureShape).superRefine(validTimeRange);

const standaloneLecture = lecture.refine(value => !value.id.includes('::'), {
  path: ['id'],
  message: 'Standalone lecture ID must not contain the reserved "::" separator',
});

const studyLog = z.object({
  id,
  exam_id: id.optional(),
  todo_id: id.optional(),
  date,
  duration_min: z.number().int().min(0).max(24 * 60),
  topics: z.string().max(5000).optional().default(''),
}).superRefine((value, context) => {
  if (Boolean(value.exam_id) === Boolean(value.todo_id)) {
    context.addIssue({ code: 'custom', message: 'Exactly one of exam_id or todo_id is required' });
  }
});

const settingSchemas = {
  aiProvider: z.enum(['ollama', 'gemini']),
  ollamaUrl: z.string().max(2048),
  ollamaModel: z.string().max(200),
  ollamaDisableReasoning: z.boolean(),
  geminiModel: z.string().max(200),
  geminiApiKey: z.string().trim().min(1).max(4096),
  targetEcts: z.number().int().min(0).max(360),
  targetGpa: z.number().min(1).max(4),
  preferredMensaId: z.string().regex(/^\d{1,8}$/),
  onboardingCompleted: z.boolean(),
  onboardingStep: z.number().int().min(0).max(100),
  ollamaSetupDismissed: z.boolean(),
  lastActiveChatId: z.string().max(240),
  locale: z.enum(['de', 'en', 'tr']),
  icalUrl: z.string().max(4096),
  icalLastSync: z.string().max(100),
  hideCompletedTodos: z.boolean(),
  todosHideCompleted: z.boolean(),
};

const settingsSchema = z.object(settingSchemas).partial().strict();

function settingsPatch(input) {
  return settingsSchema.parse(input);
}

const todoAction = z.object({
  id: id.optional(),
  title: z.string().max(240),
  priority: z.enum(['high', 'medium', 'low']).optional(),
});
const chatMessage = z.object({
  role: z.enum(['user', 'assistant', 'system']).optional(),
  content: z.string().max(12000).optional(),
  variant: z.enum(['todo_saved']).optional(),
  todoActions: z.array(todoAction).max(20).optional(),
  model: z.string().max(200).optional(),
  activeModel: z.string().max(200).optional(),
  fallbackUsed: z.boolean().optional(),
  fallbackReason: z.string().max(200).nullable().optional(),
  retrievalMode: z.string().max(100).optional(),
  error: z.boolean().optional(),
  errorKind: z.string().max(100).optional(),
  errorDetail: z.string().max(1000).optional(),
});
const chat = z.object({
  id,
  title: z.string().max(200).optional().default(''),
  startedAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  messages: z.array(chatMessage).max(500),
}).refine(value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 512 * 1024, {
  message: 'Serialized chat exceeds 512 KiB',
});

const aiChat = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(12000),
  })).min(1).max(16),
  context: z.object({
    locale: z.enum(['de', 'en', 'tr']).optional(),
    today: isoDate.optional(),
    allowTodoWrites: z.boolean().optional().default(false),
  }).strict().optional().default({}),
}).refine(value => Buffer.byteLength(JSON.stringify(value), 'utf8') <= 256 * 1024, {
  message: 'AI request exceeds 256 KiB',
});

const aiModels = z.object({
  aiProvider: z.enum(['ollama', 'gemini']).optional(),
  ollamaUrl: z.string().max(2048).optional(),
  geminiModel: z.string().max(200).optional(),
}).strict();
const aiRecommend = z.object({
  today: isoDate.optional(),
}).strict();
const icalFetch = z.object({
  url: z.string().url().max(4096),
}).strict();
const icalItems = z.array(z.object({
  ...lectureShape,
  id: compositeSafeId.optional(),
}).superRefine(validTimeRange)).max(10000);

module.exports = {
  schemas: {
    exam, todo, moodle, module: moduleSchema, lecture, standaloneLecture,
    studyLog, chat, aiChat, aiCreateTodo, aiModels, aiRecommend, icalFetch, icalItems,
  },
  settingsPatch,
  validIsoDate: value => isoDate.safeParse(value).success,
};
