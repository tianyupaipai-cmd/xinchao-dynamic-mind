function bool(name, fallback = false) {
  const raw = process.env[name];
  return raw == null ? fallback : ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function number(name, fallback, min, max) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be numeric`);
  return Math.max(min, Math.min(max, parsed));
}

export function loadConfig() {
  const agentName = process.env.AGENT_NAME ?? '心潮';
  const recipientName = process.env.NOTIFICATION_RECIPIENT ?? '用户';
  return {
    port: number('PORT', 18110, 1, 65535),
    serviceToken: process.env.SERVICE_TOKEN ?? '',
    statePath: process.env.STATE_PATH ?? '/app/state/state.json',
    settleIntervalMinutes: number('SETTLE_INTERVAL_MINUTES', 15, 1, 1440),
    sleepAfterMinutes: number('SLEEP_AFTER_MINUTES', 90, 5, 10080),
    shadowMode: bool('SHADOW_MODE', true),
    identity: { agentName, recipientName },
    model: {
      enabled: bool('MODEL_ENABLED', false),
      baseUrl: (process.env.MODEL_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/$/, ''),
      apiKey: process.env.MODEL_API_KEY ?? '',
      name: process.env.MODEL_NAME ?? 'local-model',
      agentName,
      recipientName,
      timeoutMs: number('MODEL_TIMEOUT_MS', 30000, 1000, 120000),
      maxInputChars: number('MODEL_MAX_INPUT_CHARS', 10000, 1000, 50000),
      maxOutputTokens: number('MODEL_MAX_OUTPUT_TOKENS', 650, 100, 4000),
      dreamPushPromptPath: process.env.DREAM_PUSH_PROMPT_PATH ?? '/app/configs/dream_push_prompt.md'
    },
    dreamMinIntervalHours: number('DREAM_MIN_INTERVAL_HOURS', 6, 1, 168),
    dreamMaxPerDay: number('DREAM_MAX_PER_DAY', 4, 1, 12),
    memory: {
      url: process.env.MEMORY_MCP_URL ?? '',
      token: process.env.MEMORY_MCP_TOKEN ?? '',
      readEnabled: bool('MEMORY_READ_ENABLED', false),
      writeEnabled: bool('MEMORY_WRITE_ENABLED', false),
      readTool: process.env.MEMORY_READ_TOOL ?? 'breath',
      writeTool: process.env.MEMORY_WRITE_TOOL ?? 'hold',
      breathMaxResults: number('MEMORY_BREATH_MAX_RESULTS', 3, 1, 10),
      breathMaxTokens: number('MEMORY_BREATH_MAX_TOKENS', 800, 200, 3000)
    },
    heartbeat: {
      filePath: process.env.MEMORY_HEARTBEAT_FILE ?? '/memory-data/heartbeat.json',
      // Dream residue may be shared after a shorter quiet period. Autonomous
      // contact stays on the stricter, long-absence threshold below.
      dreamMinIdleHours: number('BARK_DREAM_MIN_CONTACT_IDLE_HOURS', 3, 1, 24),
      proactiveMinIdleHours: number('BARK_MIN_CONTACT_IDLE_HOURS', 12, 1, 720)
    },
    bark: {
      enabled: bool('BARK_ENABLED', false),
      key: process.env.BARK_KEY ?? '',
      server: (process.env.BARK_SERVER ?? 'https://api.day.app').replace(/\/$/, ''),
      title: process.env.BARK_TITLE ?? agentName,
      group: process.env.BARK_GROUP ?? 'xinchao',
      icon: process.env.BARK_ICON ?? '',
      sound: process.env.BARK_SOUND ?? 'silence',
      level: process.env.BARK_LEVEL ?? 'timeSensitive',
      minIntervalHours: number('BARK_MIN_INTERVAL_HOURS', 3, 1, 168),
      autonomousMinIntervalHours: number('BARK_AUTONOMOUS_MIN_INTERVAL_HOURS', 12, 1, 720),
      maxPerDay: number('BARK_MAX_PER_DAY', 6, 1, 24),
      minDrive: number('BARK_MIN_DRIVE', 0.42, 0.05, 1)
    },
    settle: {
      timeZone: process.env.SETTLE_TIME_ZONE ?? process.env.DAYTIME_TIME_ZONE ?? 'Asia/Shanghai',
      dawnFreezeStart: number('DAWN_FREEZE_START', 1, 0, 12),
      dawnFreezeEnd: number('DAWN_FREEZE_END', 8, 1, 12),
    },
    daytime: {
      enabled: bool('DAYTIME_EMERGENCE_ENABLED', false),
      timeZone: process.env.DAYTIME_TIME_ZONE ?? 'Asia/Shanghai',
      startHour: number('DAYTIME_START_HOUR', 8, 0, 23),
      endHour: number('DAYTIME_END_HOUR', 23, 1, 24),
      minIntervalHours: number('DAYTIME_MIN_INTERVAL_HOURS', 2, 0.25, 24),
      maxIntervalHours: number('DAYTIME_MAX_INTERVAL_HOURS', 3, 0.25, 24),
      maxPerDay: number('DAYTIME_MAX_PER_DAY', 7, 1, 24)
    }
  };
}
