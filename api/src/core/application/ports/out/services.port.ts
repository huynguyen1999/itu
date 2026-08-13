import { SuggestedCard } from '@core/application/ports/in/ai-use-case.port';
import type { Readable } from 'stream';
import {
  CardGrading,
  ReviewSessionInput,
  SessionFeedbackResult,
  StoreCardImageInput,
  StoreUserImageInput,
  StoreAudioInput,
  VerifiedTokenPayload,
} from './service-types.port';

export interface StoredImage {
  storageKey: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  sortOrder: number;
}

export interface StoredAudio {
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
}

export interface IMediaStorage {
  storeCardImage(input: StoreCardImageInput): Promise<StoredImage>;
  storeUserImage(input: StoreUserImageInput): Promise<StoredImage>;
  storeAudio(input: StoreAudioInput): Promise<StoredAudio>;
  storeRawBuffer(storageKey: string, buffer: Buffer): Promise<void>;
  read(storageKey: string): Promise<Readable | null>;
  delete(storageKey: string): Promise<void>;
}

export interface IAiProvider {
  generateCards(userId: string, pastedText: string): Promise<SuggestedCard[]>;
  reviewSession(userId: string, input: ReviewSessionInput): Promise<SessionFeedbackResult>;
  streamCards(userId: string, pastedText: string): AsyncIterable<string>;
  streamSessionSummary(userId: string, input: ReviewSessionInput): AsyncIterable<string>;
  generateSessionGrading(
    userId: string,
    input: ReviewSessionInput,
  ): Promise<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }>;
}

export interface IAiCredentialCrypto {
  encrypt(value: string): string;
  decrypt(value: string): string;
  keyHint(value: string): string;
}

export interface IGeminiKeyValidator {
  validate(apiKey: string): Promise<void>;
}

export interface SyncQueueJob {
  type: 'sync-invalidation';
  jobId: string;
  userId: string;
  entityType: string;
  entityId: string;
  operation: 'UPSERT' | 'DELETE';
  data: object;
  originDeviceId?: string;
  originClientInstanceId?: string;
}

export interface IQueueJobHandler {
  enqueueCardSuggestions(jobId: string): Promise<void>;
  enqueueSessionFeedback(jobId: string): Promise<void>;
  enqueueScheduledJob(jobId: string): Promise<void>;
  enqueueSyncInvalidation(job: Omit<SyncQueueJob, 'type' | 'jobId'>): Promise<void>;
}

export interface SyncInvalidationTarget {
  deviceId: string;
  platform: string;
  pushToken?: string | null;
}

export interface SyncInvalidationEvent {
  userId: string;
  originDeviceId: string;
  originClientInstanceId: string;
  cursor: string;
  targets: SyncInvalidationTarget[];
}

export interface ISyncInvalidationNotifier {
  notifySyncAvailable(event: SyncInvalidationEvent): Promise<void>;
}

export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}

export interface ITokenService {
  signAccessToken(userId: string, email: string): Promise<string>;
  signRefreshToken(userId: string, email: string, sessionId: string): Promise<string>;
  verifyRefreshToken(token: string): Promise<VerifiedTokenPayload>;
  signRegisterToken(profile: { email: string; displayName?: string; providerUserId: string }): Promise<string>;
  verifyRegisterToken(token: string): Promise<{ email: string; displayName?: string; providerUserId: string }>;
}

export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
