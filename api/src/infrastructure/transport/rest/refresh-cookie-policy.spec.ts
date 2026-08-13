import { refreshCookiePolicy } from './refresh-cookie-policy';

describe('refresh cookie policy', () => {
  it('allows a refresh cookie on an explicitly configured HTTP development or private-network origin', () => {
    expect(refreshCookiePolicy('http://100.77.186.45:5173', true)).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 15_552_000,
    });
  });

  it('uses cross-site-compatible secure cookies for HTTPS deployments', () => {
    expect(refreshCookiePolicy('https://app.example.com', false)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
  });

  it('falls back to a local-compatible policy when the origin is missing', () => {
    expect(refreshCookiePolicy(undefined, true).secure).toBe(false);
  });
});
