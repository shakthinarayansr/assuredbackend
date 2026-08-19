import { isProfileComplete, missingProfileFields } from './profile-completeness';

const base = {
  name: 'Priya Raman',
  roles: ['housekeeping'],
  homeLat: 12.9352,
  homeLng: 77.6245,
};

describe('profile completeness', () => {
  it('accepts a profile with a name, a role and a home area', () => {
    expect(isProfileComplete(base)).toBe(true);
    expect(missingProfileFields(base)).toEqual([]);
  });

  it('rejects a name that is only whitespace', () => {
    expect(isProfileComplete({ ...base, name: '   ' })).toBe(false);
    expect(missingProfileFields({ ...base, name: '   ' })).toEqual(['name']);
  });

  it('rejects a worker with no roles to match on', () => {
    expect(isProfileComplete({ ...base, roles: [] })).toBe(false);
  });

  it('treats half a home area as no home area', () => {
    // Shortlisting measures travel distance; one coordinate cannot do that.
    expect(isProfileComplete({ ...base, homeLng: null })).toBe(false);
    expect(missingProfileFields({ ...base, homeLng: null })).toEqual(['homeArea']);
  });

  it('names every missing field at once, so the client can route to them', () => {
    expect(missingProfileFields({ name: null, roles: [], homeLat: null, homeLng: null })).toEqual([
      'name',
      'roles',
      'homeArea',
    ]);
  });
});
