import assert from 'node:assert/strict';
import test from 'node:test';
import { REPLY_TONES } from '../src/chat/interaction-state.js';
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
  assert.match(buildSpeechInstruction('IRRITATED'), /真实不满/);
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
  assert.equal(irritated.pitch, plain.pitch);
  assert.equal(irritated.volume, plain.volume);
  assert.ok(positive.rate > plain.rate);
  assert.equal(positive.pitch, plain.pitch);
  assert.match(irritated.text, /<break time="90ms"\/>/u);
  assert.match(positive.text, /<break time="100ms"\/>/u);
});

test('synthesis markup escapes model text instead of accepting injected SSML', () => {
  const plan = buildSpeechSynthesisPlan('PLAIN', '你看<break time="9s"/>这里，知道吗？');
  assert.doesNotMatch(plan.text, /你看<break time="9s"\/>/u);
  assert.match(plan.text, /你看&lt;break time=&quot;9s&quot;\/&gt;这里，<break time="150ms"\/>知道吗？/u);
});
