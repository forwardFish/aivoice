import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmotionExpressionPlan } from '../src/emotion-expression.js';
import { buildSpeechSynthesisPlan, instructionWeightedLength } from '../src/speech-instruction.js';
import { REPLY_TONES, type ConversationInteractionState } from '../src/chat/interaction-state.js';

function state(intensity: 1 | 2 | 3): ConversationInteractionState {
  return {
    version: 2,
    carryAffect: {
      emotion: 'SAD', intensity,
      cause: { source: 'CURRENT_OR_RECENT_DIALOGUE', turnId: 't1:USER', quote: '我真的很难过' },
      emotionEvidence: '真的很难过', remainingTurns: intensity,
    },
    action: { stance: 'RESPOND', currentWant: null, cause: null, requestDecision: { kind: 'NONE' } },
    createdAt: new Date(0).toISOString(),
  };
}

test('neutral wording is not forced into a pure angry performance', () => {
  const plan = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '你到了以后先过来找我，我们再慢慢说。', interactionState: null,
  });
  assert.equal(plan.effectiveTone, 'MIXED');
  assert.equal(plan.alignmentAdjusted, true);
  assert.match(plan.instructionFragment, /短停后自然放软/);

  const synthesis = buildSpeechSynthesisPlan('IRRITATED', '你到了以后先过来找我，我们再慢慢说。', null, plan);
  assert.equal(synthesis.effectiveTone, 'MIXED');
  assert.equal(synthesis.rate, 1);
  assert.match(synthesis.text, /<break time="168ms"\/>/u);
  assert.equal(synthesis.enableSsml, true);
});

test('the same irritated emotion is expressed differently by explicit personalities', () => {
  const quick = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '临时才说真的很不爽，别再这样。', interactionState: null,
    personalityNote: '【用户明确选择】脾气来得快：触发时反应快；表达直接：会点明问题。',
  });
  const restrained = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '临时才说让我不高兴，下次早点告诉我。', interactionState: null,
    personalityNote: '【用户明确选择】温柔耐心：小摩擦不升级；重视边界：会说清期待。',
  });
  assert.equal(quick.personalityStyle, 'QUICK_DIRECT_IRRITATED');
  assert.equal(quick.deliveryMode, 'DIRECT_TENSE');
  assert.ok(quick.rateFactor > 1);
  assert.ok(quick.pauseFactor < 1);
  assert.equal(quick.volumeOffset, 0);
  assert.equal(restrained.personalityStyle, 'RESTRAINED_IRRITATED');
  assert.equal(restrained.deliveryMode, 'QUIET_UNEASY');
  assert.ok(restrained.rateFactor < 1);
  assert.ok(restrained.pauseFactor > 1);
  assert.equal(restrained.volumeOffset, -1);
  assert.notEqual(quick.instructionFragment, restrained.instructionFragment);
});

test('current turn focus outranks an opposite dormant trait from the full personality note', () => {
  const plan = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '临时才说真的让我很不高兴。', interactionState: null,
    personalityNote: '【用户明确选择】温柔耐心：平时愿意听完；脾气来得快：被临时变卦时反应快。',
    personalityTurnFocus: {
      phase: 'TRIGGER',
      primary: { label: '脾气来得快', clause: '被临时变卦时反应快', family: 'EMOTION_TRIGGER' },
      secondary: null,
      instruction: '只针对当前触发表达',
      resolvedBoundary: false,
    } as any,
  });
  assert.equal(plan.personalityStyle, 'QUICK_IRRITATED');
  assert.ok(plan.rateFactor > 1);
  assert.ok(plan.pauseFactor < 1);
});

test('positive emotion uses a small pitch lift while sad choking requires strong evidence', () => {
  const happy = buildEmotionExpressionPlan({
    replyTone: 'POSITIVE', text: '太好了，我真的很开心！', interactionState: null,
  });
  assert.ok(happy.pitchFactor > 1);
  assert.equal(happy.intensity, 2);

  const mildSad = buildEmotionExpressionPlan({
    replyTone: 'SAD_OR_HURT', text: '我只是有点难受。', interactionState: null,
  });
  assert.equal(mildSad.intensity, 1);
  assert.equal(mildSad.effectiveTone, 'SAD_OR_HURT');
  assert.equal(mildSad.deliveryMode, 'SOFT_HURT');
  assert.doesNotMatch(mildSad.instructionFragment, /哽住/);
  const mildSadSynthesis = buildSpeechSynthesisPlan('SAD_OR_HURT', '我只是有点难受。', null, mildSad);
  assert.equal(mildSadSynthesis.enableSsml, false);
  assert.equal(mildSadSynthesis.text, '我只是有点难受。');
  const sadWithNaturalBoundary = buildSpeechSynthesisPlan('SAD_OR_HURT', '你刚才那样说，我心里真的有点难受。', null, mildSad);
  assert.equal(sadWithNaturalBoundary.enableSsml, true);
  assert.match(sadWithNaturalBoundary.text, /<break time="216ms"\/>/u);

  const strongSad = buildEmotionExpressionPlan({
    replyTone: 'SAD_OR_HURT', text: '我真的忍不住哭了，有点说不出话。', interactionState: state(3),
  });
  assert.equal(strongSad.intensity, 3);
  assert.match(strongSad.instructionFragment, /个别词略哽住/);
  assert.ok(strongSad.pauseFactor > mildSad.pauseFactor);
  assert.ok(strongSad.volumeOffset < mildSad.volumeOffset);
});

test('person baseline, emotion performance and explicit correction fit one bounded instruction', () => {
  const expression = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '你又临时才说，我真的有点不高兴。', interactionState: null,
    personalityNote: '【用户明确选择】温柔耐心：小摩擦不升级。',
  });
  const synthesis = buildSpeechSynthesisPlan('IRRITATED', '你又临时才说，我真的有点不高兴。', {
    rateFactor: 1, pauseFactor: 1, volumeOffset: -2,
    instructionFragment: '原口音咬字；中速、中停顿、自然起伏；校准：情绪时音量更低',
  }, expression);
  assert.equal(synthesis.volume, 47);
  assert.ok(instructionWeightedLength(synthesis.instruction) <= 100);
  assert.match(synthesis.instruction, /校准：情绪时音量更低/);
  assert.match(synthesis.instruction, /声音稍收，停顿自然，连着说/);
});

test('all eight reply tones produce bounded executable emotion plans', () => {
  const textByTone = {
    PLAIN: '我知道了，我们慢慢说。',
    POSITIVE: '太好了，我真的很开心！',
    CONCERNED: '我有点担心你，路上慢一点。',
    LOW_ENERGY: '今天真的有点累，我想先休息。',
    UNEASY: '我有点紧张，也不知道该怎么办。',
    SAD_OR_HURT: '我心里有点难过，真的不好受。',
    IRRITATED: '你又临时才说，我真的很不高兴。',
    MIXED: '我还有点不高兴，不过我们慢慢说。',
  } as const;
  for (const tone of REPLY_TONES) {
    const expression = buildEmotionExpressionPlan({
      replyTone: tone,
      text: textByTone[tone],
      interactionState: null,
      personalityNote: '【用户明确选择】表达直接：会点明问题；嘴硬心软：缓和时会放软。',
    });
    const synthesis = buildSpeechSynthesisPlan(tone, textByTone[tone], {
      rateFactor: 1,
      pauseFactor: 1,
      volumeOffset: 0,
      instructionFragment: '原口音咬字；中速、中停顿、自然起伏；校准：保持自然不要表演',
    }, expression);
    assert.ok(instructionWeightedLength(synthesis.instruction) <= 100, `${tone}:${synthesis.instruction}`);
    assert.ok(synthesis.rate >= 0.85 && synthesis.rate <= 1.15);
    assert.ok(synthesis.pitch >= 0.95 && synthesis.pitch <= 1.05);
    assert.ok(synthesis.volume >= 45 && synthesis.volume <= 55);
    if (synthesis.enableSsml) {
      assert.match(synthesis.text, /^<speak /u);
    } else {
      assert.equal(synthesis.text, textByTone[tone]);
    }
  }
});

test('12-year-old surprise, embarrassment and autonomy use distinct derived styles', () => {
  const surprise = buildEmotionExpressionPlan({ replyTone: 'POSITIVE', text: '真的假的？你居然买到了！', interactionState: null });
  const embarrassed = buildEmotionExpressionPlan({ replyTone: 'UNEASY', text: '你别夸我啦，怪不好意思的。', interactionState: null });
  const autonomy = buildEmotionExpressionPlan({
    replyTone: 'IRRITATED', text: '这是我的事，你先听我说完。', interactionState: null,
    personalityNote: '有自己的主意：对自己的事情有看法\n在意被尊重：希望意见被听见',
  });
  assert.equal(surprise.personalityStyle, 'SURPRISED_POSITIVE');
  assert.equal(embarrassed.personalityStyle, 'EMBARRASSED_UNEASY');
  assert.equal(autonomy.personalityStyle, 'AUTONOMY_IRRITATED');
  assert.equal(surprise.deliveryMode, 'BRIGHT_LIGHT');
  assert.equal(embarrassed.deliveryMode, 'QUIET_UNEASY');
  assert.equal(autonomy.deliveryMode, 'DIRECT_TENSE');
  assert.equal(autonomy.speechAct, 'EXPLAIN');
});

test('personality labels collapse into one delivery mode and one speech act for Seed Audio', () => {
  const hardSoft = buildEmotionExpressionPlan({
    replyTone: 'MIXED', text: '我才没有担心你，就是看你这么晚还没回来。', interactionState: null,
    personalityNote: '嘴硬心软：担心时不会直接承认。',
  });
  const playful = buildEmotionExpressionPlan({
    replyTone: 'PLAIN', text: '你今天这么好说话呀。', interactionState: null,
    personalityNote: '爱开玩笑：熟悉后会顺口调侃。',
  });
  assert.equal(hardSoft.personalityStyle, 'HARD_SOFT_MIXED');
  assert.equal(hardSoft.deliveryMode, 'DIRECT_TENSE');
  assert.equal(hardSoft.speechAct, 'EXPLAIN');
  assert.equal(buildSpeechSynthesisPlan('MIXED', '我才没有担心你，就是回来看看。', null, hardSoft).enableSsml, false);
  assert.equal(playful.deliveryMode, 'PLAYFUL_LIGHT');
  assert.equal(playful.speechAct, 'TEASE');
});
