import { useState } from 'react';
import {
  Bell,
  CalendarClock,
  Cloud,
  Flag,
  Monitor,
  Palette,
  Settings,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { SettingsCard } from './components/SettingsCard';
import { useTheme } from '@/shared/ui/ThemeProvider';

type SettingsSection = 'appearance' | 'notifications' | 'profile' | 'security' | 'sync' | 'device';

const sections: Array<{ id: SettingsSection; label: string; icon: typeof Settings }> = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'profile', label: 'Account / Profile', icon: Monitor },
  { id: 'security', label: 'Security', icon: CalendarClock },
  { id: 'sync', label: 'Sync & Data', icon: Cloud },
  { id: 'device', label: 'Device & Permissions', icon: Flag },
];

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>('appearance');
  const theme = useTheme();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        kicker="Preferences & System"
        title="Settings"
        description="Configure appearance, account security, cloud synchronization, and device system permissions."
      />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border bg-card p-2 lg:sticky lg:top-8 lg:self-start">
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                section === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
              onClick={() => setSection(id)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </aside>

        <main className="min-w-0 space-y-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">System Settings</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">Application Preferences</h1>
          </div>

          {section === 'appearance' && (
            <SettingsCard icon={Palette} title="Theme" description="Switch the application visual theme between light and dark mode.">
              <Button onClick={theme.toggleTheme} className="w-fit">
                Use {theme.theme === 'dark' ? 'light' : 'dark'} mode
              </Button>
            </SettingsCard>
          )}
          {section === 'notifications' && (
            <SettingsCard
              icon={Bell}
              title="Notifications"
              description="Desktop and browser alert delivery permissions."
            />
          )}
          {section === 'profile' && (
            <SettingsCard
              icon={Monitor}
              title="Account / Profile"
              description="Authenticated user identity, profile details, and active authentication sessions."
            />
          )}
          {section === 'security' && (
            <SettingsCard
              icon={CalendarClock}
              title="Security"
              description="Password management, refresh sessions, and authentication security."
            />
          )}
          {section === 'sync' && (
            <SettingsCard
              icon={Cloud}
              title="Sync & Data"
              description="Offline outbox queue status, cross-device replication state, and conflict resolution."
            />
          )}
          {section === 'device' && (
            <SettingsCard
              icon={Flag}
              title="Device & Permissions"
              description="Browser installation device ID, client instance session, and system permissions."
            />
          )}
        </main>
      </div>
    </div>
  );
}
