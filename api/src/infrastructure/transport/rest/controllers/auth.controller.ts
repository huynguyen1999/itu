import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { ServerResponse } from 'node:http';
import {
  AUTH_ERRORS,
  CONFIG_KEYS,
  DEFAULT_URLS,
  GOOGLE_OAUTH,
  HTTP_HEADERS,
  QUERY_PARAMS,
  REST_ROUTES,
} from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import { AuthService } from '@core/application/use-cases/auth.service';
import type { ILogger } from '@core/application/ports/out/services.port';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  LoginDto,
  OAuthExchangeDto,
  RegisterDto,
  UpdateProfileDto,
  GoogleRegisterDto,
} from '../dto/auth.dto';
import { AuthGuard as JwtAuthGuard } from '../guards/auth.guard';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import { refreshCookiePolicy } from '../refresh-cookie-policy';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

type CookieReply = FastifyReply & {
  setCookie(name: string, value: string, options: Record<string, unknown>): FastifyReply;
  clearCookie(name: string, options: Record<string, unknown>): FastifyReply;
};

const REFRESH_COOKIE = 'itu_refresh';

@ApiTags('Auth')
@Controller(REST_ROUTES.auth)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
    private readonly config: ConfigService,
  ) {}

  /**
   * Register new user account.
   *
   * @description Creates a new user profile with email/password and sets authentication refresh cookies.
   * @why Enables new users to sign up and establish an account.
   * @when Called when submitting the registration form on the signup page.
   */
  @ApiOperation({ operationId: 'register' })
  @Post(REST_ROUTES.register)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: FastifyReply) {
    return this.withRefreshCookie(res, await this.auth.register(dto));
  }

  /**
   * User login.
   *
   * @description Authenticates email and password credentials, returning JWT access token and setting HTTP-only refresh cookie.
   * @why Grants authenticated access to user account resources.
   * @when Called when submitting the login form.
   */
  @ApiOperation({ operationId: 'login' })
  @Post(REST_ROUTES.login)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: FastifyReply) {
    return this.withRefreshCookie(res, await this.auth.login(dto));
  }

  /**
   * Refresh JWT access token.
   *
   * @description Issues a new access token using the HTTP-only refresh cookie or body token.
   * @why Maintains seamless authenticated session without forcing user to re-type password.
   * @when Automatically invoked by frontend HTTP interceptor upon receiving a 401 Unauthorized status.
   */
  @ApiOperation({ operationId: 'refresh' })
  @Post(REST_ROUTES.refresh)
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Body('refreshToken') bodyRefreshToken: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const refreshToken = this.refreshTokenFromRequest(req) ?? bodyRefreshToken;
    if (!refreshToken) throw new UnauthorizedException(AUTH_ERRORS.missingRefreshToken);
    return this.withRefreshCookie(res, await this.auth.refresh(refreshToken));
  }

  /**
   * User logout.
   *
   * @description Revokes the refresh token and clears the authentication cookie.
   * @why Securely terminates active session.
   * @when Called when user clicks "Logout" in user settings.
   */
  @ApiOperation({ operationId: 'logout' })
  @Post(REST_ROUTES.logout)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Body('refreshToken') bodyRefreshToken: string | undefined,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.auth.logout(this.refreshTokenFromRequest(req) ?? bodyRefreshToken);
    this.clearRefreshCookie(res);
    return { ok: true };
  }

  /**
   * Get active user session info.
   *
   * @description Fetches current authenticated user's profile and account settings.
   * @why Verifies session validity and hydrates user state in client app.
   * @when Called during application initial boot/hydration.
   */
  @ApiOperation({ operationId: 'getAuthSession' })
  @UseGuards(JwtAuthGuard)
  @Get(REST_ROUTES.me)
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.getAuthSession(req.user.sub);
  }

  /**
   * Update user profile.
   *
   * @description Updates user profile attributes such as display name and avatar URL.
   * @why Allows users to update profile details.
   * @when Called when saving profile changes in account settings.
   */
  @ApiOperation({ operationId: 'updateProfile' })
  @UseGuards(JwtAuthGuard)
  @Patch(REST_ROUTES.me)
  updateProfile(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.sub, dto);
  }

  /**
   * Change password.
   *
   * @description Validates current password and updates to a new password.
   * @why Allows updating account password securely.
   * @when Called when submitting "Change Password" form in settings.
   */
  @ApiOperation({ operationId: 'changePassword' })
  @UseGuards(JwtAuthGuard)
  @Post(REST_ROUTES.password)
  async changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(req.user.sub, dto);
    return { ok: true };
  }

  /**
   * Export all user data.
   *
   * @description Generates a structured JSON dump of all user data.
   * @why Fulfills GDPR privacy compliance data download requirements.
   * @when Called when clicking "Export My Data" in privacy settings.
   */
  @UseGuards(JwtAuthGuard)
  @Get(REST_ROUTES.dataExport)
  exportData(@Req() req: AuthenticatedRequest) {
    return this.auth.exportData(req.user.sub);
  }

  /**
   * Delete account.
   *
   * @description Permanently deletes user account and purges associated data after password confirmation.
   * @why Fulfills right-to-be-forgotten requirement.
   * @when Called when confirming account deletion in security settings.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(REST_ROUTES.me)
  async deleteAccount(@Req() req: AuthenticatedRequest, @Body() dto: DeleteAccountDto) {
    await this.auth.deleteAccount(req.user.sub, dto.password);
    return { ok: true };
  }

  /**
   * Initiate Google OAuth flow.
   *
   * @description Redirects the user browser to Google's OAuth 2.0 authorization screen.
   * @why Starts Google social login sequence.
   * @when Called when user clicks "Sign in with Google" button.
   */
  @Get(REST_ROUTES.google)
  google(@Res() res: FastifyReply) {
    return this.redirect(res, this.auth.googleAuthorizationUrl());
  }

  /**
   * Google OAuth callback redirect handler.
   *
   * @description Handles OAuth authorization code callback from Google and redirects to web frontend with handoff code.
   * @why Exchanges Google auth code for session tokens securely.
   * @when Automatically redirected by Google's OAuth consent screen.
   */
  @Get(REST_ROUTES.googleCallback)
  async googleCallback(
    @Query(QUERY_PARAMS.code) code: string | undefined,
    @Query(QUERY_PARAMS.error) error: string | undefined,
    @Res() res: FastifyReply,
  ) {
    const webOrigin = this.config.get<string>(CONFIG_KEYS.webOrigin, DEFAULT_URLS.webOrigin);
    if (error || !code) {
      return this.redirect(res, `${webOrigin}/auth?error=${GOOGLE_OAUTH.redirectError}`);
    }

    try {
      const session = await this.auth.loginWithGoogleCode(code);
      if (session.type === 'register') {
        const handoffCode = await this.auth.createOAuthHandoff({ registerToken: session.registerToken });
        return this.redirect(res, `${webOrigin}/auth?oauthCode=${encodeURIComponent(handoffCode)}`);
      }
      const handoffCode = await this.auth.createOAuthHandoff(session);
      return this.redirect(res, `${webOrigin}/auth?oauthCode=${encodeURIComponent(handoffCode)}`);
    } catch (err) {
      this.logger.warn('Google OAuth callback failed', { error: err instanceof Error ? err.message : String(err) });
      return this.redirect(res, `${webOrigin}/auth?error=${GOOGLE_OAUTH.redirectError}`);
    }
  }

  /**
   * Complete Google OAuth registration.
   *
   * @description Finalizes registration for a new user logging in via Google for the first time.
   * @why Captures required terms agreement before creating a new Google account.
   * @when Called when user accepts terms during Google OAuth signup handoff.
   */
  @Post(REST_ROUTES.googleRegister)
  async googleRegister(@Body() dto: GoogleRegisterDto, @Res({ passthrough: true }) res: FastifyReply) {
    return this.withRefreshCookie(
      res,
      await this.auth.registerWithGoogle({
        registerToken: dto.registerToken,
        termsAgreed: dto.termsAgreed,
      }),
    );
  }

  /**
   * Exchange OAuth handoff code.
   *
   * @description Swaps a temporary single-use handoff code for actual JWT tokens and refresh cookie.
   * @why Prevents exposing JWT tokens directly in URL redirect query strings.
   * @when Called immediately after frontend mounts from Google OAuth redirect landing page.
   */
  @Post(REST_ROUTES.oauthExchange)
  async oauthExchange(@Body() dto: OAuthExchangeDto, @Res({ passthrough: true }) res: FastifyReply) {
    const result = await this.auth.exchangeOAuthHandoff(dto.code);
    if ('registerToken' in result) return result;
    return this.withRefreshCookie(res, result);
  }

  private redirect(res: FastifyReply, url: string): void {
    const raw = res.raw as ServerResponse;
    raw.statusCode = 302;
    raw.setHeader(HTTP_HEADERS.location, url);
    raw.setHeader(HTTP_HEADERS.contentLength, '0');
    raw.end();
  }

  private withRefreshCookie(
    res: FastifyReply,
    session: { user: unknown; accessToken: string; refreshToken: string },
  ): { user: unknown; accessToken: string; refreshToken: string } {
    this.setRefreshCookie(res, session.refreshToken);
    return {
      user: session.user,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  private setRefreshCookie(res: FastifyReply, refreshToken: string): void {
    (res as CookieReply).setCookie(
      REFRESH_COOKIE,
      refreshToken,
      refreshCookiePolicy(this.config.get<string>(CONFIG_KEYS.webOrigin), true),
    );
  }

  private clearRefreshCookie(res: FastifyReply): void {
    (res as CookieReply).clearCookie(
      REFRESH_COOKIE,
      refreshCookiePolicy(this.config.get<string>(CONFIG_KEYS.webOrigin), false),
    );
  }

  private refreshTokenFromRequest(req: AuthenticatedRequest): string | undefined {
    return (req.cookies as Record<string, string | undefined> | undefined)?.[REFRESH_COOKIE];
  }
}
