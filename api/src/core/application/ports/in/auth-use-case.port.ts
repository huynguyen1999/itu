import { UserModel } from '@core/domain/models';

export interface AuthResult {
  user: Pick<UserModel, 'id' | 'email' | 'username' | 'displayName'> & { roles: string[]; permissions: string[] };
  accessToken: string;
  refreshToken: string;
}

export interface RegisterCommand {
  email?: string;
  username?: string;
  password: string;
  displayName?: string;
}

export interface LoginCommand {
  identifier?: string;
  email?: string;
  username?: string;
  password: string;
}

export interface GoogleLoginCommand {
  email: string;
  displayName?: string;
  providerUserId: string;
}

export type GoogleAuthResult =
  | {
      type: 'success';
      user: Pick<UserModel, 'id' | 'email' | 'username' | 'displayName'> & { roles: string[]; permissions: string[] };
      accessToken: string;
      refreshToken: string;
    }
  | { type: 'register'; registerToken: string };

export interface UpdateProfileCommand {
  displayName?: string | null;
  username?: string | null;
}

export interface ChangePasswordCommand {
  currentPassword: string;
  newPassword: string;
}

export interface IAuthUseCase {
  register(command: RegisterCommand): Promise<AuthResult>;
  login(command: LoginCommand): Promise<AuthResult>;
  googleAuthorizationUrl(): string;
  loginWithGoogleCode(code: string): Promise<GoogleAuthResult>;
  loginWithGoogle(command: GoogleLoginCommand): Promise<GoogleAuthResult>;
  registerWithGoogle(command: { registerToken: string; termsAgreed: boolean }): Promise<AuthResult>;
  refresh(refreshToken: string): Promise<AuthResult>;
  logout(refreshToken?: string): Promise<void>;
  createOAuthHandoff(result: AuthResult | { registerToken: string }): Promise<string>;
  exchangeOAuthHandoff(code: string): Promise<AuthResult | { registerToken: string }>;
  getAuthSession(userId: string): Promise<AuthResult>;
  updateProfile(userId: string, command: UpdateProfileCommand): Promise<AuthResult>;
  changePassword(userId: string, command: ChangePasswordCommand): Promise<void>;
  exportData(userId: string): Promise<unknown>;
  deleteAccount(userId: string, password?: string): Promise<void>;
}
