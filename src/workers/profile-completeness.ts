/**
 * What "complete" means for a worker profile, defined once.
 *
 * Both the login response and the profile endpoint report this, and they must
 * never disagree — a client told it is done at sign-in and then told it is not
 * on the next screen has no way to resolve the contradiction.
 *
 * The bar is what shortlisting needs: a name to show the client, at least one
 * role to match on, and a home area to measure travel distance from.
 */
export interface ProfileCompletenessInput {
  name: string | null;
  roles: string[];
  homeLat: number | null;
  homeLng: number | null;
}

export function isProfileComplete(worker: ProfileCompletenessInput): boolean {
  return (
    worker.name !== null &&
    worker.name.trim().length > 0 &&
    worker.roles.length > 0 &&
    worker.homeLat !== null &&
    worker.homeLng !== null
  );
}

/** The fields still missing, so the client can route straight to them. */
export function missingProfileFields(worker: ProfileCompletenessInput): string[] {
  const missing: string[] = [];
  if (worker.name === null || worker.name.trim().length === 0) missing.push('name');
  if (worker.roles.length === 0) missing.push('roles');
  if (worker.homeLat === null || worker.homeLng === null) missing.push('homeArea');
  return missing;
}
