import { useMemo, useState } from 'react';
import { Copy, LoaderCircle } from 'lucide-react';
import { getClientInstanceId, getDeviceId } from '@/shared/sync/syncIdentity';
import { Button } from '@/shared/ui/button';
import { getBrowserNotificationPermission, requestBrowserNotificationPermission } from './notificationPermissions';

export function DeviceSettings() {
  const deviceId = useMemo(() => getDeviceId(), []);
  const clientInstanceId = useMemo(() => getClientInstanceId(), []);
  const [permission, setPermission] = useState(getBrowserNotificationPermission);
  const [isRequesting, setIsRequesting] = useState(false);
  const [copied, setCopied] = useState('');

  async function copyValue(label: string, value: string) {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(''), 1600);
    } catch {
      // Clipboard access is optional and may be blocked by the browser.
    }
  }

  async function requestPermission() {
    setIsRequesting(true);
    try {
      setPermission(await requestBrowserNotificationPermission());
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <div className="grid gap-4 border-t pt-4">
      <DeviceIdentityRow
        label="Sync device ID"
        description="Stable identifier for this browser installation."
        value={deviceId}
        copied={copied === 'device'}
        onCopy={() => void copyValue('device', deviceId)}
      />
      <DeviceIdentityRow
        label="Current tab instance"
        description="Unique to this open tab and refreshed when it closes."
        value={clientInstanceId}
        copied={copied === 'tab'}
        onCopy={() => void copyValue('tab', clientInstanceId)}
      />
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Browser notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {permission === 'granted'
              ? 'Allowed for this site.'
              : permission === 'denied'
                ? 'Blocked by the browser. Change it from the address-bar site settings.'
                : permission === 'unsupported'
                  ? 'This browser does not support web notifications.'
                  : 'Permission has not been requested yet.'}
          </p>
        </div>
        {permission === 'default' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRequesting}
            onClick={() => void requestPermission()}
          >
            {isRequesting ? <LoaderCircle className="animate-spin" /> : null}
            Allow notifications
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DeviceIdentityRow({
  label,
  description,
  value,
  copied,
  onCopy,
}: {
  label: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="grid gap-2 border-b pb-4 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
          <Copy />
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <code className="break-all rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">{value}</code>
    </div>
  );
}
