const { z } = require('zod');

const id = z.string().trim().min(1).max(240);
const short = z.string().max(240);
const date = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const time = z.union([z.literal(''), z.string().regex(/^\d{2}:\d{2}$/)]);

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
}).passthrough();

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
}).passthrough();

const moodle = z.object({
  id,
  name: z.string().trim().min(1).max(240),
  code: short.optional(),
  semester: short.optional(),
  url: z.string().max(2048).optional(),
  color: z.string().max(32).optional(),
}).passthrough();

const slot = z.object({
  id,
  day: z.enum(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']),
  time: time.optional().default(''),
  end_time: time.optional().default(''),
  room: z.string().max(240).optional().default(''),
  lecturer: z.string().max(240).optional().default(''),
  allDay: z.boolean().optional().default(false),
  overrides: z.record(z.string(), z.object({
    canceled: z.boolean().optional(),
    time: time.optional(),
    end_time: time.optional(),
    room: z.string().max(240).optional(),
  }).passthrough()).optional(),
}).passthrough();

const moduleSchema = z.object({
  id,
  name: z.string().trim().min(1).max(240),
  code: short.optional().default(''),
  semester: short.optional().default(''),
  moodleUrl: z.string().max(2048).optional().default(''),
  color: z.string().max(32).optional().default('#3B82F6'),
  source: z.string().max(40).optional(),
  slots: z.array(slot).max(500).optional().default([]),
}).passthrough();

const lecture = z.object({
  id,
  name: z.string().max(240).optional().default(''),
  day: z.enum(['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']).optional(),
  time: time.optional().default(''),
  end_time: time.optional().default(''),
  room: z.string().max(240).optional().default(''),
  lecturer: z.string().max(240).optional().default(''),
  color: z.string().max(32).optional(),
  eventDate: date.optional().default(''),
  allDay: z.boolean().optional().default(false),
  imported: z.boolean().optional(),
  icalUid: z.string().max(500).optional(),
  moduleId: id.or(z.literal('')).optional(),
}).passthrough();

const studyLog = z.object({
  id,
  exam_id: id.optional(),
  todo_id: id.optional(),
  date,
  duration_min: z.number().int().min(0).max(24 * 60),
  topics: z.string().max(5000).optional().default(''),
}).passthrough().superRefine((value, context) => {
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

function settingsPatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Settings must be an object');
  const result = {};
  for (const [keyName, value] of Object.entries(input)) {
    const schema = settingSchemas[keyName];
    if (!schema) throw new Error(`Unknown setting: ${keyName}`);
    result[keyName] = schema.parse(value);
  }
  return result;
}

const chat = z.object({
  id,
  title: z.string().max(200).optional().default(''),
  startedAt: z.string().max(100).optional(),
  updatedAt: z.string().max(100).optional(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']).optional(),
    content: z.string().max(12000).optional(),
  }).passthrough()).max(500),
}).passthrough();

const aiChat = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(12000),
  })).min(1).max(16),
  context: z.object({
    locale: z.enum(['de', 'en', 'tr']).optional(),
    today: z.string().max(100).optional(),
  }).passthrough().optional().default({}),
});

module.exports = {
  schemas: { exam, todo, moodle, module: moduleSchema, lecture, studyLog, chat, aiChat },
  settingsPatch,
};
