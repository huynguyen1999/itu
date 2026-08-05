const DEVICE_ID_KEY = 'itu_sync_device_id_v2';
const CLIENT_INSTANCE_ID_KEY = 'itu_sync_client_instance_id_v1';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createUlid(now = Date.now()): string {
  let time = now;
  let result = '';
  for (let index = 0; index < 10; index += 1) {
    result = CROCKFORD[time % 32] + result;
    time = Math.floor(time / 32);
  }
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  for (let index = 0; index < 16; index += 1) {
    result += CROCKFORD[random[index] % 32];
  }
  return result;
}

export function getDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = createUlid();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function getClientInstanceId(): string {
  let clientInstanceId = sessionStorage.getItem(CLIENT_INSTANCE_ID_KEY);
  if (!clientInstanceId) {
    clientInstanceId = createUlid();
    sessionStorage.setItem(CLIENT_INSTANCE_ID_KEY, clientInstanceId);
  }
  return clientInstanceId;
}
