import assert from 'node:assert/strict';
import test from 'node:test';
import { REPLY_TONES } from '../src/chat/interaction-state.js';
import { buildEmotionExpressionPlan } from '../src/emotion-expression.js';
import { buildSpeechInstruction, buildSpeechSynthesisPlan, instructionWeightedLength } from '../src/speech-instruction.js';

test('every reply tone maps to a bounded CosyVoice instruction', () => {
  const instructions = REPLY_TONES.map((tone) => buildSpeechInstruction(tone));
  assert.equal(new Set(instructions).size, REPLY_TONES.length);
  for (const instruction of instructions) {
    assert.ok(instructionWeightedLength(instruction) <= 100);
  }
});

test('important conversational tones receive distinct prosody directions', () => {
  assert.match(buildSpeechInstruction('POSITIVE'), /明显开心/);
  assert.match(buildSpeechInstruction('IRRITATED'), /正常说话/);
  assert.match(buildSpeechInstruction('MIXED'), /前半还在不满/);
  assert.match(buildSpeechInstruction('PLAIN'), /不要播报/);
});

test('visible reply stays unchanged while synthesis receives escaped SSML and a tone-specific pause', () => {
  const visible = '知道错就行，过来让我靠一会儿。';
  const plan = buildSpeechSynthesisPlan('MIXED', visible);
  assert.equal(visible, '知道错就行，过来让我靠一会儿。');
  assert.match(plan.text, /^<speak rate="0\.98" pitch="1" volume="50">/u);
  assert.match(plan.text, /知道错就行，<break time="360ms"\/>过来让我靠一会儿。/u);
  assert.equal(plan.enableSsml, true);
});

test('irritated and positive delivery are audibly stronger than plain without changing spoken words', () => {
  const visible = '你到了以后先过来找我，我们再慢慢说。';
  const plain = buildSpeechSynthesisPlan('PLAIN', visible);
  const irritated = buildSpeechSynthesisPlan('IRRITATED', visible);
  const positive = buildSpeechSynthesisPlan('POSITIVE', visible);
  assert.ok(irritated.rate > plain.rate);
  assert.ok(irritated.rate - plain.rate <= 0.02);
  assert.equal(irritated.pitch, plain.pitch);
  assert.equal(irritated.volume, plain.volume);
  assert.ok(positive.rate > plain.rate);
  assert.equal(positive.pitch, plain.pitch);
  assert.match(irritated.text, /<break time="240ms"\/>/u);
  assert.match(positive.text, /<break time="100ms"\/>/u);
});

test('synthesis markup escapes model text instead of accepting injected SSML', () => {
  const plan = buildSpeechSynthesisPlan('PLAIN', '你看<break time="9s"/>这里，知道吗？');
  assert.doesNotMatch(plan.text, /你看<break time="9s"\/>/u);
  assert.match(plan.text, /你看&lt;break time=&quot;9s&quot;\/&gt;这里，<break time="260ms"\/>知道吗？/u);
});

test('observable person baseline adjusts rate, pause and instruction without changing visible words', () => {
  const plan = buildSpeechSynthesisPlan('IRRITATED', '阿哲，晚点要先说。别让我猜。', {
    rateFactor: 0.94,
    pauseFactor: 1.22,
    volumeOffset: -2,
    instructionFragment: '保持参考中的偏慢语速、停顿稍多',
  });
  assert.equal(plan.rate, 0.931);
  assert.equal(plan.volume, 48);
  assert.match(plan.text, /<break time="293ms"\/>/);
  assert.match(plan.instruction, /保持参考中的偏慢语速、停顿稍多/);
  assert.ok(instructionWeightedLength(plan.instruction) <= 100);
});

test('explicit tone correction remains within the CosyVoice instruction limit', () => {
  const instruction = buildSpeechInstruction('IRRITATED', {
    rateFactor: 1,
    pauseFactor: 1,
    volumeOffset: -2,
    instructionFragment: '原口音咬字；中速、中停顿、多起伏；校准：情绪时音量更低',
  });
  assert.match(instruction, /校准：情绪时音量更低/);
  assert.ok(instructionWeightedLength(instruction) <= 100);
});

test('explicit pause is decided from each person baseline, sentence shape and speech act instead of emotion names', () => {
  const casual = buildEmotionExpressionPlan({ replyTone: 'PLAIN', text: '我知道啦，马上回来。', interactionState: null });
  const sad = buildEmotionExpressionPlan({ replyTone: 'SAD_OR_HURT', text: '你刚才那样说，我有点难受。', interactionState: null });
  const hardSoft = buildEmotionExpressionPlan({
    replyTone: 'MIXED', text: '我才没有担心你，就是回来看看。', interactionState: null,
    personalityNote: '嘴硬心软：担心时不会直接承认。',
  });
  const manyPauses = { rateFactor: 1, pauseFactor: 1.22, volumeOffset: 0, instructionFragment: '原口音咬字；中速、多停顿' };
  const fewPauses = { rateFactor: 1, pauseFactor: 0.82, volumeOffset: 0, instructionFragment: '原口音咬字；中速、少停顿' };

  assert.equal(buildSpeechSynthesisPlan('PLAIN', '我知道啦，马上回来。', manyPauses, casual).enableSsml, true);
  assert.equal(buildSpeechSynthesisPlan('SAD_OR_HURT', '你刚才那样说，我有点难受。', fewPauses, sad).enableSsml, false);
  assert.equal(buildSpeechSynthesisPlan('MIXED', '我才没有担心你，就是回来看看。', manyPauses, hardSoft).enableSsml, false);
  assert.equal(buildSpeechSynthesisPlan('SAD_OR_HURT', '我有点难受。', manyPauses, sad).enableSsml, false);
});
