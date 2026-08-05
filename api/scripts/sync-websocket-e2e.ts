import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

type AuthSession = {
  accessToken: string;
};

type Task = {
  id: string;
  title: string;
  status: string;
  version: number;
};

type SyncAvailableMessage = {
  type: 'SYNC_AVAILABLE';
  cursor: string;
  originDeviceId: string;
  originClientInstanceId: string;
};

const apiBaseUrl = trimTrailingSlash(process.env.API_BASE_URL ?? 'http://localhost:3000');
const username = process.env.E2E_USERNAME ?? 'admin';
const password = process.env.E2E_PASSWORD ?? 'admin';
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 10_000);

const instanceA = {
  deviceId: `e2e-device-a-${Date.now()}`,
  clientInstanceId: `e2e-client-a-${Date.now()}`,
};
const instanceB = {
  deviceId: `e2e-device-b-${Date.now()}`,
  clientInstanceId: `e2e-client-b-${Date.now()}`,
};

async function main() {
  const session = await login();
  await Promise.all([
    registerDevice(session.accessToken, instanceA.deviceId),
    registerDevice(session.accessToken, instanceB.deviceId),
  ]);

  const task = await createTask(session.accessToken);
  const websocketA = await connectWebSocket(session.accessToken, instanceA);
  const websocketB = await connectWebSocket(session.accessToken, instanceB);

  try {
    const unexpectedOriginNotification = waitForSyncAvailable(
      websocketA,
      1_500,
      (message) =>
        message.originDeviceId === instanceA.deviceId &&
        message.originClientInstanceId === instanceA.clientInstanceId,
    ).then(
      (message) => ({ message }),
      () => null,
    );
    const notification = waitForSyncAvailable(
      websocketB,
      timeoutMs,
      (message) =>
        message.originDeviceId === instanceA.deviceId &&
        message.originClientInstanceId === instanceA.clientInstanceId,
    );

    await updateTaskThroughSync(session.accessToken, task);

    const received = await notification;
    if (received.originDeviceId !== instanceA.deviceId) {
      throw new Error(`Expected originDeviceId ${instanceA.deviceId}, received ${received.originDeviceId}`);
    }
    if (received.originClientInstanceId !== instanceA.clientInstanceId) {
      throw new Error(
        `Expected originClientInstanceId ${instanceA.clientInstanceId}, received ${received.originClientInstanceId}`,
      );
    }
    if (!received.cursor) throw new Error('Expected websocket notification to include a cursor');

    const originEcho = await unexpectedOriginNotification;
    if (originEcho) {
      throw new Error(`Origin instance unexpectedly received its own sync notification: ${JSON.stringify(originEcho.message)}`);
    }

    console.log(`PASS websocket sync notification reached instance B at cursor ${received.cursor}`);
  } finally {
    websocketA.close();
    websocketB.close();
  }
}

async function login(): Promise<AuthSession> {
  return request<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: username, password }),
  });
}

async function registerDevice(accessToken: string, deviceId: string): Promise<void> {
  await request('/devices/register', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ deviceId, platform: 'WEB', lastKnownSyncCursor: '0' }),
  });
}

async function createTask(accessToken: string): Promise<Task> {
  return request<Task>('/productivity/tasks', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({
      title: `websocket sync e2e ${new Date().toISOString()}`,
      status: 'PLANNED',
    }),
  });
}

async function updateTaskThroughSync(accessToken: string, task: Task): Promise<void> {
  const response = await request<{
    acknowledgedMutationIds: string[];
    conflicts: unknown[];
    latestServerCursor: string;
  }>('/sync/mutations', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({
      deviceId: instanceA.deviceId,
      clientInstanceId: instanceA.clientInstanceId,
      mutations: [
        {
          id: createUlid(),
          kind: 'task.update',
          entityId: task.id,
          baseVersion: task.version,
          baseValues: { status: task.status },
          payload: { status: 'IN_PROGRESS' },
          occurredAt: new Date().toISOString(),
        },
      ],
    }),
  });

  if (response.conflicts.length > 0) throw new Error(`Sync mutation conflicted: ${JSON.stringify(response.conflicts)}`);
  if (response.acknowledgedMutationIds.length !== 1) {
    throw new Error(`Expected one acknowledged mutation, received ${response.acknowledgedMutationIds.length}`);
  }
}

async function connectWebSocket(
  accessToken: string,
  instance: { deviceId: string; clientInstanceId: string },
): Promise<WebSocket> {
  const url = new URL('/ws/sync', apiBaseUrl.replace(/^http/, 'ws'));
  url.searchParams.set('token', accessToken);
  url.searchParams.set('deviceId', instance.deviceId);
  url.searchParams.set('clientInstanceId', instance.clientInstanceId);

  const websocket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out connecting websocket for ${instance.clientInstanceId}`)), timeoutMs);
    websocket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    websocket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    websocket.once('close', (code, reason) => {
      clearTimeout(timer);
      reject(new Error(`Websocket closed before opening: ${code} ${reason.toString()}`));
    });
  });
  return websocket;
}

async function waitForSyncAvailable(
  websocket: WebSocket,
  timeout: number,
  predicate: (message: SyncAvailableMessage) => boolean = () => true,
): Promise<SyncAvailableMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting ${timeout}ms for SYNC_AVAILABLE`));
    }, timeout);

    const onMessage = (raw: WebSocket.RawData) => {
      const parsed = parseSyncMessage(raw);
      if (parsed?.type !== 'SYNC_AVAILABLE') return;
      if (!predicate(parsed)) return;
      cleanup();
      resolve(parsed);
    };
    const onClose = (code: number, reason: Buffer) => {
      cleanup();
      reject(new Error(`Websocket closed while waiting for sync notification: ${code} ${reason.toString()}`));
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      websocket.off('message', onMessage);
      websocket.off('close', onClose);
      websocket.off('error', onError);
    };

    websocket.on('message', onMessage);
    websocket.once('close', onClose);
    websocket.once('error', onError);
  });
}

function parseSyncMessage(raw: WebSocket.RawData): SyncAvailableMessage | null {
  try {
    const value = JSON.parse(raw.toString()) as Partial<SyncAvailableMessage>;
    if (
      value.type === 'SYNC_AVAILABLE' &&
      typeof value.cursor === 'string' &&
      typeof value.originDeviceId === 'string' &&
      typeof value.originClientInstanceId === 'string'
    ) {
      return value as SyncAvailableMessage;
    }
  } catch {
    return null;
  }
  return null;
}

async function request<T = unknown>(
  path: string,
  options: { method: string; body?: string; accessToken?: string },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: options.body,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${options.method} ${path} failed with ${response.status}: ${body}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function createUlid(): string {
  const time = Date.now();
  const timeChars = encodeBase32(time, 10);
  const randomChars = Array.from(randomBytes(16))
    .map((byte) => CROCKFORD[byte % CROCKFORD.length])
    .join('')
    .slice(0, 16);
  return `${timeChars}${randomChars}`;
}

function encodeBase32(value: number, length: number): string {
  let remaining = value;
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[remaining % 32] + output;
    remaining = Math.floor(remaining / 32);
  }
  return output;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

void main().catch(async (error) => {
  await delay(0);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
