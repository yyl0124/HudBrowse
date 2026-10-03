import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './validators';
describe('URL normalization', () => {
  it('adds HTTPS to a bare host', () => expect(normalizeUrl(' example.com ')).toBe('https://example.com/'));
  it('rejects scripts and non-web URLs', () => {
    expect(() => normalizeUrl('javascript:alert(1)')).toThrow();
    expect(() => normalizeUrl('file:///C:/secret')).toThrow();
  });
});
