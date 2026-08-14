export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  return typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported';
}

export function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) return Promise.resolve('unsupported');
  return window.Notification.requestPermission();
}

export function notificationPermissionLabel(permission: NotificationPermission | 'unsupported') {
  if (permission === 'granted') return 'Alerts allowed';
  if (permission === 'denied') return 'Alerts blocked';
  if (permission === 'unsupported') return 'Not supported';
  return 'Permission needed';
}
