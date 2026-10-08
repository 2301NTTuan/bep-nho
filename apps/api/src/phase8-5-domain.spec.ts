import {
  decisionSourceVersionId,
  distinctPersonalizedVersionChoices,
  selectDefaultPersonalizedVersion,
} from '@bep-nho/domain';

type Version = { id: string; originType: 'taste_engine' | 'user_edit' };

const engine = (id: string): Version => ({ id, originType: 'taste_engine' });
const edited = (id: string): Version => ({ id, originType: 'user_edit' });

describe('Phase 8.5 active personalized version selection', () => {
  it('falls back to canonical when no personalized version exists', () => {
    expect(selectDefaultPersonalizedVersion({
      latestEngine: null, latestAny: null, bestVersion: null,
    })).toBeNull();
  });

  it('selects an engine version when it is the only personalized version', () => {
    const v4 = engine('v4');
    expect(selectDefaultPersonalizedVersion({
      latestEngine: v4, latestAny: null, bestVersion: null,
    })).toBe(v4);
  });

  it('prefers the latest user edit over an older engine suggestion', () => {
    const v4 = engine('v4');
    const v5 = edited('v5');
    expect(selectDefaultPersonalizedVersion({
      latestEngine: v4, latestAny: v5, bestVersion: null,
    })).toBe(v5);
  });

  it('prefers My Best Version over a newer latest version', () => {
    const v3 = edited('v3');
    expect(selectDefaultPersonalizedVersion({
      latestEngine: engine('v4'), latestAny: edited('v5'), bestVersion: v3,
    })).toBe(v3);
  });

  it('deduplicates version choices and sources decisions from the active version', () => {
    const v4 = engine('v4');
    const v5 = edited('v5');
    const choices = distinctPersonalizedVersionChoices({
      latestEngine: v4, latestAny: v5, bestVersion: v5,
    });
    expect(choices.map(({ version }) => version.id)).toEqual(['v5', 'v4']);
    expect(choices.map(({ label }) => label)).toEqual(['Bản ngon nhất', 'Gợi ý mới nhất']);
    expect(decisionSourceVersionId(v5)).toBe('v5');
    expect(decisionSourceVersionId(null)).toBeNull();
  });
});
