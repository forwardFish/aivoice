import assert from 'node:assert/strict';
import test from 'node:test';
import { AGE_IDENTITY_STAGES, genderLabel, resolveAgeIdentity } from '../src/chat/age-identity.js';

test('age identity stages cover the whole life span without gaps or overlaps', () => {
  assert.equal(AGE_IDENTITY_STAGES.length, 18);
  assert.equal(AGE_IDENTITY_STAGES[0]?.minAge, 0);
  for (let index = 0; index < AGE_IDENTITY_STAGES.length - 1; index += 1) {
    assert.equal(AGE_IDENTITY_STAGES[index]?.maxAge, AGE_IDENTITY_STAGES[index + 1]?.minAge);
  }
  assert.equal(AGE_IDENTITY_STAGES.at(-1)?.maxAge, null);
});

test('requested validation ages map to the expected stages', () => {
  assert.equal(resolveAgeIdentity(3).code, 'TODDLER_CONVERSATION');
  assert.equal(resolveAgeIdentity(8).code, 'EARLY_PRIMARY');
  assert.equal(resolveAgeIdentity(12).code, 'EARLY_ADOLESCENCE');
  assert.equal(resolveAgeIdentity(70).code, 'EARLY_OLDER_ADULTHOOD');
  assert.equal(resolveAgeIdentity(80).code, 'ADVANCED_OLDER_ADULTHOOD');
});

test('gender changes identity labels without changing age stages', () => {
  assert.equal(genderLabel(8, 'FEMALE'), '女孩');
  assert.equal(genderLabel(8, 'MALE'), '男孩');
  assert.equal(genderLabel(12, 'FEMALE'), '青少年女孩');
  assert.equal(genderLabel(12, 'MALE'), '青少年男孩');
  assert.equal(resolveAgeIdentity(12).code, 'EARLY_ADOLESCENCE');
});

test('age identity text does not assign personality stereotypes', () => {
  const corpus = AGE_IDENTITY_STAGES.map((stage) => stage.identityText).join('\n');
  for (const stereotype of ['一定叛逆', '一定温柔', '一定活泼', '一定内向', '一定外向']) {
    assert.equal(corpus.includes(stereotype), false, stereotype);
  }
});
