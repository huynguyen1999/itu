export const CONFIG_KEYS = {
  aiProvider: 'AI_PROVIDER',
  geminiApiKey: 'GEMINI_API_KEY',
  geminiModel: 'GEMINI_MODEL',
  geminiVisionModel: 'GEMINI_VISION_MODEL',
  googleCallbackUrl: 'GOOGLE_CALLBACK_URL',
  googleClientId: 'GOOGLE_CLIENT_ID',
  googleClientSecret: 'GOOGLE_CLIENT_SECRET',
  httpConnectTimeoutMs: 'HTTP_CONNECT_TIMEOUT_MS',
  httpKeepAliveMaxTimeoutMs: 'HTTP_KEEP_ALIVE_MAX_TIMEOUT_MS',
  httpKeepAliveTimeoutMs: 'HTTP_KEEP_ALIVE_TIMEOUT_MS',
  httpRequestTimeoutMs: 'HTTP_REQUEST_TIMEOUT_MS',
  httpStreamTimeoutMs: 'HTTP_STREAM_TIMEOUT_MS',
  jwtAccessSecret: 'JWT_ACCESS_SECRET',
  jwtRefreshSecret: 'JWT_REFRESH_SECRET',
  mediaPublicBaseUrl: 'MEDIA_PUBLIC_BASE_URL',
  mediaRoot: 'MEDIA_ROOT',
  port: 'PORT',
  publicRoot: 'PUBLIC_ROOT',
  openRouterApiKey: 'OPENROUTER_API_KEY',
  openRouterAppTitle: 'OPENROUTER_APP_TITLE',
  openRouterBaseUrl: 'OPENROUTER_BASE_URL',
  openRouterHttpReferer: 'OPENROUTER_HTTP_REFERER',
  openRouterModel: 'OPENROUTER_MODEL',
  openRouterVisionModel: 'OPENROUTER_VISION_MODEL',
  rabbitMqAiQueue: 'RABBITMQ_AI_QUEUE',
  rabbitMqExchange: 'RABBITMQ_EXCHANGE',
  rabbitMqScheduledQueue: 'RABBITMQ_SCHEDULED_QUEUE',
  rabbitMqSyncQueue: 'RABBITMQ_SYNC_QUEUE',
  rabbitMqUrl: 'RABBITMQ_URL',
  webOrigin: 'WEB_ORIGIN',
} as const;

export const DEFAULT_URLS = {
  apiOrigin: 'http://localhost:3000',
  mediaBaseUrl: 'http://localhost:3000/media',
  mediaRoot: './storage/media',
  publicRoot: './public',
  webOrigin: 'http://localhost:5173',
} as const;

export const HTTP_HEADERS = {
  authorization: 'Authorization',
  contentLength: 'Content-Length',
  contentType: 'Content-Type',
  location: 'Location',
} as const;

export const HTTP_CLIENT_CONSTANTS = {
  defaultConnectTimeoutMs: 10_000,
  defaultKeepAliveMaxTimeoutMs: 60_000,
  defaultKeepAliveTimeoutMs: 10_000,
  defaultRequestTimeoutMs: 30_000,
  defaultStreamTimeoutMs: 180_000,
} as const;

export const CONTENT_TYPES = {
  formUrlEncoded: 'application/x-www-form-urlencoded',
  json: 'application/json',
} as const;

export const AUTH_CONSTANTS = {
  bearerPrefix: 'Bearer ',
  googleProvider: 'GOOGLE',
  accessTokenTtl: '15m',
  refreshTokenTtl: '30d',
} as const;

export const AUTH_ERRORS = {
  googleNotConfigured: 'Google OAuth is not configured',
  googleProfileMissingEmail: 'Google profile did not include an email',
  googleProfileMissingRequiredFields: 'Google profile did not include required fields',
  googleProfileRequestFailed: 'Google profile request failed',
  googleTokenExchangeFailed: 'Google token exchange failed',
  googleTokenMissingAccessToken: 'Google token response did not include an access token',
  missingRefreshToken: 'Missing refresh token',
} as const;

export const GOOGLE_OAUTH = {
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
  callbackPath: '/auth/google/callback',
  disabledClientId: 'disabled-google-client-id',
  disabledClientSecret: 'disabled-google-client-secret',
  redirectError: 'google_login_failed',
  scope: 'openid email profile',
  strategyScope: ['email', 'profile'],
  accessType: 'online',
  prompt: 'select_account',
  responseType: 'code',
  grantType: 'authorization_code',
} as const;

export const REST_ROUTES = {
  ai: 'ai',
  auth: 'auth',
  cardImages: 'cards/:cardId/images',
  cardImage: 'cards/:cardId/images/:imageId',
  cardsMove: 'cards/move',
  cardsByDeck: 'decks/:deckId/cards',
  cardByDeck: 'decks/:deckId/cards/:cardId',
  importDecks: 'decks/import',
  dashboard: 'dashboard',
  decks: 'decks',
  deckById: ':deckId',
  deckStats: 'decks/:deckId/stats',
  devices: 'devices',
  devicesRegister: 'register',
  deviceById: ':deviceId',
  due: 'due',
  studyCalendar: 'study-calendar',
  google: 'google',
  googleCallback: 'google/callback',
  googleRegister: 'google/register',
  dataExport: 'data-export',
  jobsById: 'jobs/:jobId',
  login: 'login',
  logout: 'logout',
  me: 'me',
  oauthExchange: 'oauth/exchange',
  password: 'password',
  refresh: 'refresh',
  register: 'register',
  sessionFeedback: 'session-feedback/:sessionId',
  sessions: 'sessions',
  sessionComplete: 'sessions/:sessionId/complete',
  sessionReviews: 'sessions/:sessionId/reviews',
  study: 'study',
  summary: 'summary',
  sync: 'sync',
  bootstrap: 'bootstrap',
  productivity: 'productivity',
  taskLists: 'task-lists',
  projects: 'projects',
  taskListById: 'task-lists/:id',
  projectById: 'projects/:id',
  taskTags: 'task-tags',
  taskSections: 'task-sections',
  taskSectionById: 'task-sections/:id',
  tasks: 'tasks',
  taskMatrix: 'tasks/matrix',
  taskReorder: 'tasks/reorder',
  taskById: 'tasks/:id',
  taskComplete: 'tasks/:id/complete',
  taskReopen: 'tasks/:id/reopen',
  taskCancel: 'tasks/:id/cancel',
  taskArchive: 'tasks/:id/archive',
  taskReminders: 'tasks/:id/reminders',
  taskReminderSnooze: 'task-reminders/:id/snooze',
  taskReminderDismiss: 'task-reminders/:id/dismiss',
  notifications: 'notifications',
  notificationsReadAll: 'notifications/read-all',
  notificationReadById: 'notifications/:id/read',
  focusPresets: 'focus-presets',
  focusSessionsActive: 'focus-sessions/active',
  focusSessionsHistory: 'focus-sessions/history',
  focusSessionsSummary: 'focus-sessions/summary',
  focusSessions: 'focus-sessions',
  focusSessionAction: 'focus-sessions/:id/:action',
  focusSessionAdjust: 'focus-sessions/:id/adjust',
  focusSounds: 'focus-sounds',
  focusSoundById: 'focus-sounds/:id',
  habits: 'habits',
  habitById: 'habits/:id',
  habitOccurrences: 'habit-occurrences',
  habitOccurrenceCheckIn: 'habit-occurrences/:id/check-in',
  habitOccurrenceSkip: 'habit-occurrences/:id/skip',
  habitOccurrenceFail: 'habit-occurrences/:id/fail',
  habitOccurrenceUndo: 'habit-occurrences/:id/undo',
  habitOccurrenceChecklist: 'habit-occurrences/:occurrenceId/checklist/:itemId',
  habitTimeBlocks: 'habit-time-blocks',
  habitStats: 'habits/:id/stats',
  habitCommitmentPolicy: 'habits/:id/commitment-policy',
  habitOccurrenceEvaluateCommitment: 'habit-occurrences/:id/commitment/evaluate',
  habitOccurrenceExcuseCommitment: 'habit-occurrences/:id/commitment/excuse',
  cardSuggestions: 'card-suggestions',
  trash: 'trash',
  trashDeckRestore: 'decks/:deckId/restore',
  trashCardRestore: 'cards/:cardId/restore',
  trashCardImageRestore: 'card-images/:imageId/restore',
  trashTaskRestore: 'tasks/:taskId/restore',
  trashDeckDelete: 'decks/:deckId',
  trashCardDelete: 'cards/:cardId',
  trashCardImageDelete: 'card-images/:imageId',
  trashTaskDelete: 'tasks/:taskId',
} as const;

export const ROUTE_PARAMS = {
  cardId: 'cardId',
  deckId: 'deckId',
  deviceId: 'deviceId',
  imageId: 'imageId',
  jobId: 'jobId',
  roleId: 'roleId',
  sessionId: 'sessionId',
  taskId: 'taskId',
  userId: 'userId',
} as const;

export const QUERY_PARAMS = {
  code: 'code',
  deckId: 'deckId',
  error: 'error',
} as const;

export const MEDIA_CONSTANTS = {
  allowedImageMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  defaultImageSlug: 'image',
  maxImageBytes: 8 * 1024 * 1024,
  maxUploadFiles: 1,
  outputMimeType: 'image/webp',
  outputExtension: 'webp',
  resizeFit: 'inside',
  resizeMaxHeight: 1600,
  resizeMaxWidth: 1600,
  serveRoot: '/media',
  webpQuality: 82,
  allowedAudioMimeTypes: ['audio/mpeg', 'audio/mp3'] as readonly string[],
  maxAudioBytes: 25 * 1024 * 1024,
  audioServeRoot: '/media/audio',
} as const;

export const MEDIA_ERRORS = {
  imageFileRequired: 'Image file is required',
  imageTooLarge: 'Image must be smaller than 8MB',
  invalidImageSide: 'Valid image side is required',
  unsupportedImageType: 'Unsupported image type',
  audioFileRequired: 'MP3 audio file is required',
  audioTooLarge: 'Audio must be smaller than 25MB',
  unsupportedAudioType: 'Only MP3 audio files are supported',
} as const;

export const AI_IMAGE_LIMITS = {
  maxImagesPerCard: 2,
  maxImagesPerSession: 12,
  maxTotalBytes: 15 * 1024 * 1024,
} as const;

export const AI_CONSTANTS = {
  defaultProvider: 'openrouter',
  defaultGeminiModel: 'gemini-3.5-flash',
  responseMimeType: CONTENT_TYPES.json,
  suggestedTag: 'ai-suggested',
  fallbackWeakArea: 'Review missed cards once more',
  fallbackNextStep: 'Add one clarifying card for any weak concept',
  fallbackConfidence: 0.5,
  maxWeakAreas: 3,
} as const;

export const OPENROUTER_CONSTANTS = {
  chatCompletionsPath: '/chat/completions',
  defaultBaseUrl: 'https://openrouter.ai/api/v1',
  defaultModel: 'openrouter/free',
  defaultVisionModel: 'openrouter/free',
} as const;

export const AI_ERRORS = {
  missingResponseText: 'Gemini response did not include text output',
  sessionIncomplete: 'Session must be completed before feedback',
} as const;

export const QUEUE_CONSTANTS = {
  defaultRabbitMqAiQueue: 'itu.ai.jobs',
  defaultRabbitMqScheduledQueue: 'itu.scheduled.jobs',
  defaultRabbitMqSyncQueue: 'itu.sync.jobs',
  defaultRabbitMqExchange: 'itu.ai',
  exchangeType: 'topic',
  routingKeys: {
    cardSuggestions: 'ai.card-suggestions',
    sessionFeedback: 'ai.session-feedback',
    scheduledJob: 'scheduled.job',
    syncInvalidation: 'sync.invalidation',
  },
} as const;

export const DELETION_CONSTANTS = {
  accountDeletionGraceDays: 30,
  trashRetentionDays: 30,
  dispatcherIntervalMs: 60_000,
  publishingLockTimeoutMs: 5 * 60_000,
  publishedAckTimeoutMs: 5 * 60_000,
  dispatcherBatchSize: 25,
} as const;
