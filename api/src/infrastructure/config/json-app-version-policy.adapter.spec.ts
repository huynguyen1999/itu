import { validateAppVersionPolicy } from './json-app-version-policy.adapter';

const release = {
  latestVersion: '1.10.0',
  minimumSupportedVersion: '1.9.0',
  updateUrl: 'https://example.com/releases',
  releasedAt: '2026-01-01T00:00:00.000Z',
  title: 'iTu 1.10.0',
  releaseNotes: ['Improved stability.'],
};

describe('app version JSON policy', () => {
  it('accepts a valid policy', () => {
    expect(validateAppVersionPolicy({ ios: { stable: release } })).toEqual({ ios: { stable: release } });
  });

  it('rejects invalid versions and inverted support ranges', () => {
    expect(() => validateAppVersionPolicy({ ios: { stable: { ...release, latestVersion: '1.x.0' } } })).toThrow(
      'latestVersion is invalid',
    );
    expect(() =>
      validateAppVersionPolicy({ ios: { stable: { ...release, minimumSupportedVersion: '2.0.0' } } }),
    ).toThrow('minimumSupportedVersion exceeds latestVersion');
  });
});
