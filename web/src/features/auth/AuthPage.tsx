import { FormEvent, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome, Brain, LoaderCircle } from 'lucide-react';
import { api } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthProvider';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Checkbox } from '@/shared/ui/checkbox';

interface AuthFormValues {
  identifier: string;
  password: string;
  displayName: string;
}

export function AuthPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const oauthCode = searchParams.get('oauthCode');
  const oauthError = searchParams.get('error');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const { register: registerField, handleSubmit, formState: { isSubmitting } } = useForm<AuthFormValues>({
    defaultValues: { identifier: '', password: '', displayName: '' },
  });
  const [error, setError] = useState<string | null>(null);
  const [completingOAuth, setCompletingOAuth] = useState(Boolean(oauthCode));
  const exchangedOAuthCodeRef = useRef<string | null>(null);

  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [registeringGoogle, setRegisteringGoogle] = useState(false);

  async function handleGoogleRegister(event: FormEvent) {
    event.preventDefault();
    if (!registerToken) return;
    setError(null);
    setRegisteringGoogle(true);
    try {
      await auth.registerWithGoogle(registerToken, termsAgreed);
      setShowTermsModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegisteringGoogle(false);
    }
  }

  function handleCancelTerms() {
    setShowTermsModal(false);
    setRegisterToken(null);
    setTermsAgreed(false);
  }

  useEffect(() => {
    if (oauthError) {
      setError(
        oauthError === 'google_login_failed' ? 'Google login failed. Try again.' : 'Google authentication failed.',
      );
      navigate('/auth', { replace: true });
      return;
    }

    if (!oauthCode) return;
    if (exchangedOAuthCodeRef.current === oauthCode) return;
    exchangedOAuthCodeRef.current = oauthCode;

    let active = true;
    setCompletingOAuth(true);
    setError(null);

    auth
      .completeGoogleLogin(oauthCode)
      .then((result) => {
        if (!active) return;
        if (result.registerToken) {
          setRegisterToken(result.registerToken);
          setShowTermsModal(true);
          setCompletingOAuth(false);
          navigate('/auth', { replace: true });
          return;
        }
        navigate('/', { replace: true });
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Google authentication failed');
        setCompletingOAuth(false);
        navigate('/auth', { replace: true });
      });

    return () => {
      active = false;
    };
  }, [auth, navigate, oauthCode, oauthError]);

  if (auth.isLoading) return null;
  if (auth.isAuthenticated) return <Navigate to="/" replace />;

  if (completingOAuth) {
    return (
      <main className="itu-page-canvas min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md animate-pulse">
          <CardHeader className="text-center">
            <CardTitle className="flex justify-center mb-4">
              <Brain className="h-10 w-10 text-primary" />
            </CardTitle>
            <CardTitle className="text-2xl">iTu</CardTitle>
            <CardDescription>Signing in with Google...</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const onSubmit = handleSubmit(async (data) => {
    setError(null);
    try {
      if (mode === 'login') {
        await auth.login(data.identifier, data.password);
      } else {
        const isEmail = data.identifier.includes('@');
        await auth.register(
          isEmail
            ? { email: data.identifier, password: data.password, displayName: data.displayName }
            : { username: data.identifier, password: data.password, displayName: data.displayName },
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
  });

  return (
    <main className="itu-page-canvas relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-4">
      <div className="z-10 w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex justify-center mb-6">
          <div className="bg-background p-3 rounded-2xl shadow-sm border">
            <Brain className="h-8 w-8 text-primary" />
          </div>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">
              {mode === 'login' ? 'Welcome back' : 'Start learning'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' ? 'Sign in to continue your learning plan.' : 'Create your private study space.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="flex bg-muted p-1 rounded-lg mb-6">
                <button
                  type="button"
                  aria-pressed={mode === 'login'}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('login')}
                >
                  Login
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'register'}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${mode === 'register' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setMode('register')}
                >
                  Register
                </button>
              </div>

              {mode === 'register' && (
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display name</Label>
                  <Input
                    id="displayName"
                    {...registerField('displayName', { required: mode === 'register' })}
                    placeholder="John Doe"
                    autoComplete="name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="identifier">Username or Email</Label>
                <Input
                  id="identifier"
                  type="text"
                  {...registerField('identifier', { required: true })}
                  placeholder="username or email@example.com"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  {...registerField('password', { required: true })}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {error && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                {isSubmitting && <LoaderCircle className="animate-spin" />}
                {isSubmitting ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              variant="outline"
              type="button"
              className="w-full gap-2 bg-background text-foreground"
              onClick={() => window.location.assign(api.googleOAuthUrl())}
            >
              <Chrome size={18} /> Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={showTermsModal}
        onOpenChange={(open) => {
          if (!open) handleCancelTerms();
        }}
      >
        <DialogContent className="sm:max-w-md border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-foreground">Terms and Conditions</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Welcome to iTu! Please review and agree to our terms before continuing.
            </DialogDescription>
          </DialogHeader>

          <div className="my-4 max-h-60 overflow-y-auto rounded-lg border border-border bg-muted p-4 text-xs text-muted-foreground space-y-3 leading-relaxed">
            <h4 className="font-semibold text-foreground">1. Welcome to iTu</h4>
            <p>
              iTu is a personal productivity and learning application designed to help you plan work, build habits,
              focus deeply, and retain what you learn.
            </p>

            <h4 className="font-semibold text-foreground">2. Privacy & Data Storage</h4>
            <p>
              Your decks, cards, and review histories are private to your account. We store this data securely on our
              database. We do not sell or share your study data.
            </p>

            <h4 className="font-semibold text-foreground">3. AI Feedback and Suggestions</h4>
            <p>
              By completing review sessions and generating cards, you utilize AI services. You agree to use these
              features responsibly without pasting harmful or copyrighted content.
            </p>

            <h4 className="font-semibold text-foreground">4. User Account Responsibility</h4>
            <p>
              You are responsible for keeping your credentials safe. You agree not to engage in any activity that
              disrupts the services.
            </p>
          </div>

          <form onSubmit={handleGoogleRegister} className="space-y-4">
            <div className="flex items-start space-x-3 rounded-lg border border-border p-3 bg-muted/50 hover:bg-muted transition-colors">
              <Checkbox
                id="terms"
                checked={termsAgreed}
                onCheckedChange={(checked) => setTermsAgreed(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="grid gap-1.5 leading-none">
                <label htmlFor="terms" className="text-sm font-medium text-foreground cursor-pointer select-none">
                  I agree to the Terms of Service and Privacy Policy
                </label>
                <p className="text-xs text-muted-foreground">You must agree to continue with Google registration.</p>
              </div>
            </div>

            {error && (
              <p className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
                {error}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelTerms}
                disabled={registeringGoogle}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!termsAgreed || registeringGoogle}
                className="w-full sm:w-auto min-w-[120px]"
              >
                {registeringGoogle && <LoaderCircle className="animate-spin mr-2" size={16} />}
                {registeringGoogle ? 'Registering...' : 'Agree & Continue'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
