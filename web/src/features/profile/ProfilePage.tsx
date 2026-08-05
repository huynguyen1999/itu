import { FormEvent, useState } from 'react';
import { useAuth } from '../../shared/auth/AuthProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { AlertTriangle, CheckCircle2, Download, LoaderCircle, UserRound } from 'lucide-react';
import { api } from '../../shared/api/client';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

export function ProfilePage() {
  const auth = useAuth();
  const [displayName, setDisplayName] = useState(auth.user?.displayName ?? '');
  const [username, setUsername] = useState(auth.user?.username ?? '');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [privacyStatus, setPrivacyStatus] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [isDeleteAccountDialogOpen, setIsDeleteAccountDialogOpen] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus(null);
    setError(null);
    setSaving(true);
    try {
      await auth.updateProfile({ displayName, username: username.trim() || null });
      setStatus('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update profile');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPrivacyStatus(null);
    setPrivacyError(null);
    setPrivacySaving(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setPrivacyStatus('Password changed successfully.');
    } catch (err) {
      setPrivacyError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setPrivacySaving(false);
    }
  }

  async function exportData() {
    setPrivacyStatus(null);
    setPrivacyError(null);
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `itu-export-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setPrivacyStatus('Personal data export generated.');
    } catch (err) {
      setPrivacyError(err instanceof Error ? err.message : 'Could not export data');
    }
  }

  async function deleteAccount() {
    setPrivacyStatus(null);
    setPrivacyError(null);
    setPrivacySaving(true);
    try {
      await auth.deleteAccount(deletePassword || undefined);
    } catch (err) {
      setPrivacyError(err instanceof Error ? err.message : 'Could not delete account');
      setPrivacySaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 animate-in fade-in duration-500">
      <PageHeader
        kicker="Account & Identity"
        title="Profile"
        description="Manage the identity shown throughout your study space."
      />

      <Card>
        <form onSubmit={submit}>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Personal information</CardTitle>
                <CardDescription className="mt-1">
                  Update your display name and view your account email.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                placeholder="e.g. admin"
                minLength={3}
                maxLength={30}
                onChange={(event) => setUsername(event.target.value)}
              />
              <p className="text-[0.8rem] text-muted-foreground">Unique username used for signing into your account.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={auth.user?.email ?? ''} disabled className="bg-slate-50 text-slate-500" />
              <p className="text-[0.8rem] text-muted-foreground">Your email address cannot be changed.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>

            {status && (
              <div
                className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
                role="status"
              >
                <CheckCircle2 className="h-4 w-4" /> {status}
              </div>
            )}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
                {error}
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t bg-slate-50/50 px-6 py-4">
            <Button disabled={saving} className="ml-auto w-full sm:w-auto">
              {saving && <LoaderCircle className="animate-spin" />}
              {saving ? 'Saving' : 'Save changes'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Security and data</CardTitle>
              <CardDescription className="mt-1">
                Change your password, export your data, or delete your account.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={changePassword}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                minLength={8}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button disabled={privacySaving || newPassword.length < 8}>
                {privacySaving && <LoaderCircle className="animate-spin" />}
                Change password
              </Button>
            </div>
          </form>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Personal data export</p>
              <p className="text-sm text-muted-foreground">
                Download decks, cards, review logs, sessions, and saved AI feedback.
              </p>
            </div>
            <Button type="button" variant="outline" className="gap-2" onClick={exportData}>
              <Download className="h-4 w-4" />
              Export JSON
            </Button>
          </div>

          <div className="space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">Delete account</p>
                <p className="text-sm text-muted-foreground">This permanently deletes your account and study data.</p>
              </div>
            </div>
            <Input
              type="password"
              placeholder="Confirm password"
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              disabled={privacySaving}
              onClick={() => setIsDeleteAccountDialogOpen(true)}
            >
              Delete account
            </Button>
            <ConfirmDialog
              open={isDeleteAccountDialogOpen}
              onOpenChange={setIsDeleteAccountDialogOpen}
              title="Delete account?"
              description="This permanently deletes your iTu account, tasks, focus sessions, habits, decks, cards, review history, and related data. This action cannot be undone."
              confirmLabel="Delete account"
              isPending={privacySaving}
              onConfirm={deleteAccount}
            />
          </div>

          {privacyStatus && (
            <div
              className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm font-medium text-emerald-700"
              role="status"
            >
              <CheckCircle2 className="h-4 w-4" /> {privacyStatus}
            </div>
          )}
          {privacyError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
              {privacyError}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
