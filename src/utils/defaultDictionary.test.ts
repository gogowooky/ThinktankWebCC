import { afterEach, describe, expect, it, vi } from 'vitest';
import content from '../../docs/DefaultDictionary.yaml?raw';
import {
  DEFAULT_DICTIONARY,
  applyDictionaryOverride,
  dictionaryKeys,
  getDictionary,
  lookupDictionary,
  lookupDictionaryString,
  onDictionaryChange,
  parseDictionary,
  resetDictionaryOverride,
  serializeDictionary,
} from './defaultDictionary';

afterEach(() => resetDictionaryOverride());

describe('DefaultDictionary.yaml', () => {
  it('parses the real file at startup', () => {
    expect(() => parseDictionary(content)).not.toThrow();
    expect(DEFAULT_DICTIONARY).toEqual(parseDictionary(content));
  });
});

describe('parseDictionary', () => {
  it('treats empty / comment-only / non-mapping text as an empty dictionary', () => {
    expect(parseDictionary('')).toEqual({});
    expect(parseDictionary('# comment only\n')).toEqual({});
    expect(parseDictionary('- a\n- b\n')).toEqual({});
    expect(parseDictionary('just text')).toEqual({});
  });

  it('keeps Japanese keys, colons in keys and nested values', () => {
    const dict = parseDictionary('AS:公開情報: 06a7574d\n臨床:\n  id: c238\n  tags: [a, b]\n');
    expect(dict['AS:公開情報']).toBe('06a7574d');
    expect(dict['臨床']).toEqual({ id: 'c238', tags: ['a', 'b'] });
  });

  it('throws on broken YAML', () => {
    expect(() => parseDictionary('a: [1, 2\n')).toThrow();
  });

  it('round-trips through serializeDictionary', () => {
    const dict = { 'AS:公開情報': 'x', nested: { id: 'y', n: 1 } };
    expect(parseDictionary(serializeDictionary(dict))).toEqual(dict);
    expect(serializeDictionary({})).toBe('{}\n');
  });
});

describe('lookup and override', () => {
  it('overrides by top-level key and resets to default', () => {
    applyDictionaryOverride({ greet: 'hello', group: { id: 'g1', count: 3 } });
    expect(lookupDictionaryString('greet')).toBe('hello');
    expect(lookupDictionary('group.id')).toBe('g1');
    expect(lookupDictionaryString('group.count')).toBe('3');
    expect(lookupDictionaryString('group')).toBeUndefined();
    expect(lookupDictionary('missing.key')).toBeUndefined();
    expect(dictionaryKeys()).toContain('greet');

    resetDictionaryOverride();
    expect(lookupDictionary('greet')).toBe(DEFAULT_DICTIONARY['greet']);
    expect(getDictionary()).toEqual(DEFAULT_DICTIONARY);
  });

  it('prefers an exact top-level key containing dots over the nested path', () => {
    applyDictionaryOverride({ 'a.b': 'flat', a: { b: 'nested' } });
    expect(lookupDictionary('a.b')).toBe('flat');
  });

  it('notifies listeners on change until unsubscribed', () => {
    const listener = vi.fn();
    const off = onDictionaryChange(listener);
    applyDictionaryOverride({ k: 'v' });
    resetDictionaryOverride();
    off();
    applyDictionaryOverride({ k: 'v2' });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
