import { responseBodyLogMeta } from './http-log-sanitizer';

describe('response body log metadata', () => {
  it('summarizes a structured pre-serialization payload without logging values', () => {
    expect(
      responseBodyLogMeta(
        {
          accessToken: 'secret',
          deck: { id: 'deck-1', title: 'Biology' },
        },
        'application/json; charset=utf-8',
      ),
    ).toEqual({
      responseBody: { type: 'object', keys: ['accessToken', 'deck'] },
    });
  });

  it('does not log a structured payload for a non-text response', () => {
    expect(responseBodyLogMeta({ bytes: 'not-for-logs' }, 'image/webp')).toEqual({
      responseBody: '[omitted: non-json body]',
    });
  });

  it('deserializes and summarizes a JSON object string', () => {
    const jsonStr = JSON.stringify({ key: 'value', anotherKey: true });
    expect(responseBodyLogMeta(jsonStr, 'application/json')).toEqual({
      responseBody: { type: 'object', keys: ['key', 'anotherKey'] },
    });
  });

  it('summarizes a JSON array string by item count', () => {
    const jsonStr = JSON.stringify([{ id: 'task-1' }, { id: 'task-2' }]);
    expect(responseBodyLogMeta(jsonStr, 'application/json')).toEqual({
      responseBody: { type: 'array', itemCount: 2 },
    });
  });
});
