import library from './age-identity.library.json' with { type: 'json' };

export type VoiceGender = 'FEMALE' | 'MALE';

export type AgeIdentityStage = {
  code: string;
  name: string;
  minAge: number;
  maxAge: number | null;
  identityText: string;
};

export const AGE_IDENTITY_STAGES = library.profiles as AgeIdentityStage[];

export function resolveAgeIdentity(ageYears: number): AgeIdentityStage {
  if (!Number.isFinite(ageYears) || ageYears < 0) throw new RangeError('ageYears must be a finite non-negative number');
  const stage = AGE_IDENTITY_STAGES.find((item) => ageYears >= item.minAge && (item.maxAge === null || ageYears < item.maxAge));
  if (!stage) throw new RangeError(`age identity is missing for age ${ageYears}`);
  return stage;
}

export function genderLabel(ageYears: number, gender: VoiceGender): string {
  if (ageYears < 12) return gender === 'FEMALE' ? '女孩' : '男孩';
  if (ageYears < 18) return gender === 'FEMALE' ? '青少年女孩' : '青少年男孩';
  return gender === 'FEMALE' ? '女性' : '男性';
}
