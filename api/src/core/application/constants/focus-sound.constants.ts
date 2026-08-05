export const BUILTIN_FOCUS_SOUNDS = [
  {
    id: 'builtin:rain',
    name: 'Rain',
    category: 'Nature',
    url: '/audio/focus/rain.mp3',
    defaultVolume: 0.42,
    source: 'BUILTIN' as const,
  },
  {
    id: 'builtin:forest',
    name: 'Forest',
    category: 'Nature',
    url: '/audio/focus/forest.mp3',
    defaultVolume: 0.42,
    source: 'BUILTIN' as const,
  },
  {
    id: 'builtin:cafe',
    name: 'Café',
    category: 'Atmosphere',
    url: '/audio/focus/cafe.mp3',
    defaultVolume: 0.32,
    source: 'BUILTIN' as const,
  },
  {
    id: 'builtin:brown-noise',
    name: 'Brown noise',
    category: 'Noise',
    url: '/audio/focus/brown-noise.mp3',
    defaultVolume: 0.35,
    source: 'BUILTIN' as const,
  },
] as const;
