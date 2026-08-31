import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPersonalityTurnFocus, personalityTurnFocusEnvelope, personalityTurnFocusInstructions, personalityTurnFocusReplyViolation, resolvedBoundaryReplyViolation } from '../src/chat/personality-turn-focus.js';

const note = (parts: string) => `【用户明确选择】${parts}。`;
const turns = (current: string, previous = '') => [
  ...(previous ? [{ id: 'previous:USER', role: 'USER' as const, content: previous }] : []),
  { id: 'current:USER', role: 'USER' as const, content: current },
];

test('trigger phase distinguishes quick-temper from gentle-boundary personalities', () => {
  const quick = buildPersonalityTurnFocus({
    personalityNote: note('脾气来得快：临时变卦时不满来得快；嘴硬心软：解释到位后会缓和；喜欢亲近：愿意主动靠近；情绪退得快：认错后不长期翻旧账'),
    promptTurns: turns('我今晚会晚一个小时到，刚才忙忘了跟你说。'), previousState: null,
  });
  const gentle = buildPersonalityTurnFocus({
    personalityNote: note('温柔耐心：小摩擦不急着升级；表达直接：点明具体问题；重视边界：说清现实期待；情绪退得快：认错后不长期翻旧账'),
    promptTurns: turns('我今晚会晚一个小时到，刚才忙忘了跟你说。'), previousState: null,
  });
  assert.equal(quick?.phase, 'TRIGGER');
  assert.equal(quick?.primary.label, '脾气来得快');
  assert.match(personalityTurnFocusInstructions(quick).join('\n'), /不使用反问或任何问号/);
  assert.equal(gentle?.phase, 'TRIGGER');
  assert.equal(gentle?.primary.label, '重视边界');
  assert.equal(gentle?.secondary?.label, '表达直接');
  assert.equal(personalityTurnFocusReplyViolation(gentle, '时间有变要及时通知，不然我这边不好安排。'), 'MODELISH_BOUNDARY_TEMPLATE');
  assert.equal(personalityTurnFocusReplyViolation(quick, '晚到可以，但下次别过了才说。'), 'MODELISH_BOUNDARY_TEMPLATE');
  assert.equal(personalityTurnFocusReplyViolation(quick, '不是故意也会让人不舒服啊，我又没揪着不放。'), 'MODELISH_BOUNDARY_TEMPLATE');
  assert.equal(personalityTurnFocusReplyViolation(quick, '晚一个小时才说确实有点过分，下次早点告诉我行吗？'), 'QUICK_TRIGGER_QUESTION');

  const warmClose = buildPersonalityTurnFocus({
    personalityNote: note('温柔耐心：小摩擦不急着升级；嘴硬心软：解释到位后会缓和；喜欢亲近：愿意主动靠近；重视边界：说清现实期待'),
    promptTurns: turns('我今晚会晚一个小时到，刚才忙忘了跟你说。'), previousState: null,
  });
  assert.equal(warmClose?.primary.label, '重视边界');
  assert.equal(warmClose?.secondary?.label, '温柔耐心');
});

test('repair phase activates recovery and then the relevant expression trait', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('脾气来得快：临时变卦时不满来得快；嘴硬心软：解释到位后用短句缓和；喜欢亲近：愿意主动靠近；情绪退得快：认错后不长期翻旧账'),
    promptTurns: turns('确实是我没提前说，害你等了这么久，怪我。', '我今晚会晚一个小时到。'),
    previousState: null,
  });
  assert.equal(focus?.phase, 'REPAIR');
  assert.equal(focus?.primary.label, '情绪退得快');
  assert.equal(focus?.secondary?.label, '嘴硬心软');
});

test('affection phase produces five different focuses for the five personality cards', () => {
  const notes = [
    note('脾气来得快：有触发才不满；嘴硬心软：靠短句缓和；喜欢亲近：会回应拥抱；情绪退得快：认错后过去'),
    note('温柔耐心：愿意听完；表达直接：点明问题；重视边界：保留安排；情绪退得快：认错后过去'),
    note('脾气来得快：有触发才不满；表达直接：点明问题；重视边界：保留安排；嘴硬心软：靠短句缓和'),
    note('爱开玩笑：修复后会调侃；喜欢亲近：会回应拥抱；情绪退得快：认错后过去；表达直接：点明问题'),
    note('温柔耐心：愿意听完；嘴硬心软：靠短句缓和；喜欢亲近：会回应拥抱；重视边界：保留安排'),
  ];
  const signatures = notes.map((personalityNote) => {
    const focus = buildPersonalityTurnFocus({ personalityNote, promptTurns: turns('到了先抱一下，别还板着脸了。'), previousState: null });
    return `${focus?.primary.label}/${focus?.secondary?.label || ''}`;
  });
  assert.deepEqual(signatures, [
    '喜欢亲近/嘴硬心软',
    '温柔耐心/重视边界',
    '嘴硬心软/重视边界',
    '喜欢亲近/爱开玩笑',
    '喜欢亲近/温柔耐心',
  ]);
});

test('combination-level instructions keep conflict, repair and decision paths distinct', () => {
  const quickClose = note('脾气来得快：有触发才不满；嘴硬心软：靠短句缓和；喜欢亲近：会回应拥抱；情绪退得快：认错后过去');
  const gentleDirect = note('温柔耐心：愿意听完；表达直接：点明问题；重视边界：保留安排；情绪退得快：认错后过去');
  const strongDirect = note('脾气来得快：有触发才不满；表达直接：点明问题；重视边界：保留安排；嘴硬心软：靠短句缓和');
  const playfulClose = note('爱开玩笑：修复后会调侃；喜欢亲近：会回应拥抱；情绪退得快：认错后过去；表达直接：点明问题');
  const warmClose = note('温柔耐心：愿意听完；嘴硬心软：靠短句缓和；喜欢亲近：会回应拥抱；重视边界：保留安排');

  const focus = (personalityNote: string, current: string, previous = '') => buildPersonalityTurnFocus({
    personalityNote, promptTurns: turns(current, previous), previousState: null,
  });
  const instructions = (personalityNote: string, current: string, previous = '') => personalityTurnFocusInstructions(focus(personalityNote, current, previous)).join('\n');

  const triggerTurn = '我今晚会晚一个小时到，刚才忙忘了跟你说。';
  assert.equal(focus(gentleDirect, '你别一上来就不高兴，我又不是故意的。', triggerTurn)?.primary.label, '重视边界');
  assert.equal(focus(gentleDirect, '你别一上来就不高兴，我又不是故意的。', triggerTurn)?.secondary?.label, '温柔耐心');
  assert.match(instructions(gentleDirect, '你别一上来就不高兴，我又不是故意的。', triggerTurn), /人物此刻一个真实感受/);
  assert.match(instructions(warmClose, '你别一上来就不高兴，我又不是故意的。', triggerTurn), /说人物此刻一个真实感受/);
  assert.equal(focus(strongDirect, '你别一上来就不高兴，我又不是故意的。', triggerTurn)?.secondary?.label, '表达直接');

  assert.match(instructions(quickClose, '确实是我没提前说，害你等了这么久，怪我。'), /略带保留的实际让步、小要求或正常交流体现心软/);
  assert.match(instructions(gentleDirect, '确实是我没提前说，害你等了这么久，怪我。'), /不主动提出吃饭、拥抱或多项安排/);
  assert.match(instructions(playfulClose, '确实是我没提前说，害你等了这么久，怪我。'), /新玩笑恢复日常/);
  assert.match(instructions(strongDirect, '确实是我没提前说，害你等了这么久，怪我。'), /不得使用“知道就好、认错就行、这次算了”/);
  assert.match(instructions(warmClose, '确实是我没提前说，害你等了这么久，怪我。'), /轻微别扭接住道歉/);
  assert.match(instructions(warmClose, '确实是我没提前说，害你等了这么久，怪我。'), /人物要参与关系修复，不是批准道歉/);

  assert.match(instructions(quickClose, '我现在出发，到了以后你想怎么安排？'), /先给一个具体见面安排/);
  assert.match(instructions(gentleDirect, '我现在出发，到了以后你想怎么安排？'), /清楚、务实、平和的见面安排/);
  assert.match(instructions(gentleDirect, '我现在出发，到了以后你想怎么安排？'), /不得把吃饭、喝东西作为默认安排/);
  assert.match(instructions(strongDirect, '我现在出发，到了以后你想怎么安排？'), /见面方式、一个先后条件或当前优先事项/);
  assert.match(instructions(playfulClose, '我现在出发，到了以后你想怎么安排？'), /新的可执行安排/);
  assert.match(instructions(warmClose, '我现在出发，到了以后你想怎么安排？'), /体现人物自身偏好的共同安排/);

  assert.match(instructions(quickClose, '到了先抱一下，别还板着脸了。'), /短促的嘴硬修饰/);
  assert.match(instructions(quickClose, '到了先抱一下，别还板着脸了。'), /短促别扭一下，随即由人物主动靠近/);
  assert.match(instructions(playfulClose, '到了先抱一下，别还板着脸了。'), /新的轻微玩笑/);
  assert.match(instructions(warmClose, '到了先抱一下，别还板着脸了。'), /温和而明确地回应亲近/);
  assert.match(instructions(warmClose, '到了先抱一下，别还板着脸了。'), /语气平稳，不使用短促嘴硬/);
});

test('server envelope compiles abstract phase and combination behavior without fixed dialogue', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('爱开玩笑：修复后会调侃；喜欢亲近：会回应拥抱；情绪退得快：认错后过去；表达直接：点明问题'),
    promptTurns: turns('确实是我没提前说，害你等了这么久，怪我。'), previousState: null,
  });
  assert.ok(focus);
  const envelope = personalityTurnFocusEnvelope(focus!);
  assert.deepEqual(envelope.personality, { primary: '情绪退得快', secondary: '爱开玩笑' });
  assert.match(envelope.reply_shape, /新玩笑恢复日常/);
  assert.ok(envelope.forbidden.some((item) => item.startsWith('UNSUPPORTED_CURRENT_STATE：')));
  assert.ok(envelope.forbidden.some((item) => item.startsWith('COMPENSATION_AS_PLAN：')));
  assert.ok(envelope.forbidden.some((item) => /自然日常中文/.test(item)));
  assert.doesNotMatch(JSON.stringify(envelope), /认错态度不错|等得我都冷了|抱一下补偿/);

  const decisionFocus = buildPersonalityTurnFocus({
    personalityNote: note('爱开玩笑：修复后会调侃；喜欢亲近：会回应拥抱；情绪退得快：认错后过去；表达直接：点明问题'),
    promptTurns: turns('我现在出发，到了以后你想怎么安排？'), previousState: null,
  });
  const decisionEnvelope = personalityTurnFocusEnvelope(decisionFocus!);
  assert.match(decisionEnvelope.reply_shape, /低风险共同梗或轻微夸张/);
  assert.match(decisionEnvelope.reply_shape, /不默认选择吃饭、喝东西或睡觉/);
  assert.ok(decisionEnvelope.forbidden.some((item) => item.startsWith('REPEAT_AFFECTION_AS_PLAN：')));
});

test('no explicit selected traits or no relevant event produces no focus', () => {
  assert.equal(buildPersonalityTurnFocus({ personalityNote: '只是普通自由描述。', promptTurns: turns('今天还行。'), previousState: null }), null);
  assert.equal(buildPersonalityTurnFocus({ personalityNote: note('温柔耐心：愿意听完'), promptTurns: turns('今天还行。'), previousState: null }), null);
});

test('focus instructions distinguish willing closeness from conditional acceptance and block invented bodily state', () => {
  const close = buildPersonalityTurnFocus({
    personalityNote: note('喜欢亲近：会回应拥抱；嘴硬心软：靠短句缓和'),
    promptTurns: turns('到了先抱一下，别还板着脸了。'), previousState: null,
  });
  const hard = buildPersonalityTurnFocus({
    personalityNote: note('嘴硬心软：靠短句缓和；重视边界：保留安排'),
    promptTurns: turns('到了先抱一下，别还板着脸了。'), previousState: null,
  });
  const playfulPlan = buildPersonalityTurnFocus({
    personalityNote: note('爱开玩笑：修复后会调侃；喜欢亲近：会回应拥抱；表达直接：点明问题'),
    promptTurns: turns('我现在出发，到了以后你想怎么安排？'), previousState: null,
  });
  assert.match(personalityTurnFocusInstructions(close).join('\n'), /只说“抱可以、随你、都行、你想抱就抱”不算/);
  assert.match(personalityTurnFocusInstructions(close).join('\n'), /用户对人物表情或情绪状态的猜测只作为背景/);
  assert.match(personalityTurnFocusInstructions(close).join('\n'), /primary必须决定reply的核心意愿、注意点和主要选择/);
  assert.match(personalityTurnFocusInstructions(hard).join('\n'), /不要求主动索取、加强或延长亲近/);
  assert.match(personalityTurnFocusInstructions(hard).join('\n'), /先简短接受当前亲近，再用人物的自然参与或下一步共同行动体现心软/);
  assert.match(personalityTurnFocusInstructions(hard).join('\n'), /禁区：不得用脸色、余怒、宽恕或旧边界代替嘴硬/);
  assert.match(personalityTurnFocusInstructions(playfulPlan).join('\n'), /不得编写未提供的身体状态/);
  assert.match(personalityTurnFocusInstructions(playfulPlan).join('\n'), /不得再把拥抱或补偿作为安排中心/);
});

test('affection agency quality marker catches passive permission without rewriting the reply', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('喜欢亲近：会回应拥抱；嘴硬心软：靠短句缓和'),
    promptTurns: turns('到了先抱一下，别还板着脸了。'), previousState: null,
  });
  assert.equal(personalityTurnFocusReplyViolation(focus, '抱可以，但脸还得再板一会儿。'), 'AFFECTION_PASSIVE_PERMISSION');
  assert.equal(personalityTurnFocusReplyViolation(focus, '好，到了先抱一会儿。'), 'AFFECTION_ECHO_ONLY');
  assert.equal(personalityTurnFocusReplyViolation(focus, '过来吧，抱一会儿再说。'), null);
  assert.equal(personalityTurnFocusReplyViolation(focus, '可以抱，不过你先别笑我。'), 'AFFECTION_PASSIVE_PERMISSION');
  assert.equal(personalityTurnFocusReplyViolation(focus, '可以，过来让我抱一会儿。'), null);
});

test('repair quality marker catches parent-like judgement of an apology', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('爱开玩笑：修复后会调侃；喜欢亲近：会回应拥抱；情绪退得快：认错后过去；表达直接：点明问题'),
    promptTurns: turns('确实是我没提前说，害你等了这么久，怪我。'), previousState: null,
  });
  assert.equal(personalityTurnFocusReplyViolation(focus, '嗯，知道就好。到了发消息。'), 'AUTHORITY_JUDGMENT');
  assert.equal(personalityTurnFocusReplyViolation(focus, '等久了是有点烦，不过你认了就行。'), 'AUTHORITY_JUDGMENT');
  assert.equal(personalityTurnFocusReplyViolation(focus, '等是等了，不过你肯认就行。'), 'AUTHORITY_JUDGMENT');
  assert.equal(personalityTurnFocusReplyViolation(focus, '等是等了，不过你肯说就好。'), 'AUTHORITY_JUDGMENT');
  assert.equal(personalityTurnFocusReplyViolation(focus, '行，这事翻篇了。'), 'GENERIC_REPAIR_STAGE_PHRASE');
  assert.equal(personalityTurnFocusReplyViolation(focus, '嗯，那我们按现在的节奏来。'), 'GENERIC_REPAIR_STAGE_PHRASE');
  assert.equal(personalityTurnFocusReplyViolation(focus, '行，先过来吧，这事翻篇了。'), null);
  assert.equal(personalityTurnFocusReplyViolation(focus, '行，这事说开就过去了。'), null);
});

test('warm hard-mouth repair does not spend the later affection beat too early', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('温柔耐心：愿意听完；嘴硬心软：靠行动缓和；喜欢亲近：会回应拥抱；重视边界：保留期待'),
    promptTurns: turns('确实是我没提前说，害你等了这么久，怪我。'), previousState: null,
  });
  assert.equal(focus?.primary.label, '嘴硬心软');
  assert.equal(focus?.secondary?.label, '温柔耐心');
  assert.equal(personalityTurnFocusReplyViolation(focus, '等久了是有点闷，到了先让我靠一会儿。'), 'PREMATURE_AFFECTION_REPAIR');
  assert.equal(personalityTurnFocusReplyViolation(focus, '等久了是有点闷，到了给我发消息吧。'), null);
});

test('decision quality marker allows confirming an earlier plan but rejects compound next steps', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('喜欢亲近：会回应拥抱；重视边界：保留安排'),
    promptTurns: turns('我现在出发，到了以后你想怎么安排？'), previousState: null,
  });
  assert.equal(personalityTurnFocusReplyViolation(focus, '到了先陪我去买杯喝的。', ['那你到了先陪我去买杯喝的。']), null);
  assert.equal(personalityTurnFocusReplyViolation(focus, '到了先去附近走走，然后找地方坐一会儿。', []), 'MULTIPLE_NEXT_STEPS');
  assert.equal(personalityTurnFocusReplyViolation(focus, '到了先陪我走一段吧。', []), null);
});

test('continuing conflict rejects two repeated grievance concepts but allows a new reaction', () => {
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('脾气来得快：有触发才不满；表达直接：点明问题；重视边界：保留安排'),
    promptTurns: turns('你别一上来就不高兴，我又不是故意的。', '我今晚会晚一个小时到，刚才忙忘了跟你说。'),
    previousState: null,
  });
  assert.equal(focus?.phase, 'CONTINUING_CONFLICT');
  assert.match(personalityTurnFocusInstructions(focus).join('\n'), /用户只说明将会晚到时/);
  assert.equal(
    personalityTurnFocusReplyViolation(focus, '我知道你不是故意，但晚到才说确实让我干等了。', ['晚到才说我不爽，下次别让我干等。']),
    'REPEATED_SAME_GRIEVANCE',
  );
  assert.equal(
    personalityTurnFocusReplyViolation(focus, '我知道你不是故意，但你一解释我反而更想先缓一缓。', ['晚到才说我不爽，下次别让我干等。']),
    null,
  );
});

test('resolved boundary lets fast recovery own a later affection turn and marks reopening', () => {
  const promptTurns = [
    { id: 't1:USER', role: 'USER' as const, content: '我今晚会晚一个小时到，刚才忙忘了跟你说。' },
    { id: 't1:CHARACTER', role: 'CHARACTER' as const, content: '下次记得提前说一声，我这边也好安排。' },
    { id: 't2:USER', role: 'USER' as const, content: '你别一上来就不高兴，我又不是故意的。' },
    { id: 't2:CHARACTER', role: 'CHARACTER' as const, content: '我知道你不是故意的。' },
    { id: 't3:USER', role: 'USER' as const, content: '确实是我没提前说，害你等了这么久，怪我。' },
    { id: 't3:CHARACTER', role: 'CHARACTER' as const, content: '嗯，说开就好。' },
    { id: 't4:USER', role: 'USER' as const, content: '我现在出发，到了以后你想怎么安排？' },
    { id: 't4:CHARACTER', role: 'CHARACTER' as const, content: '到了先吃饭吧。' },
    { id: 't5:USER', role: 'USER' as const, content: '到了先抱一下，别还板着脸了。' },
  ];
  const focus = buildPersonalityTurnFocus({
    personalityNote: note('温柔耐心：小摩擦不升级；表达直接：说清问题；重视边界：表达必要期待；情绪退得快：修复后不翻旧账'),
    promptTurns, previousState: null,
  });
  assert.equal(focus?.phase, 'AFFECTION');
  assert.equal(focus?.resolvedBoundary, true);
  assert.equal(focus?.primary.label, '情绪退得快');
  assert.equal(focus?.secondary?.label, '温柔耐心');
  assert.match(personalityTurnFocusInstructions(focus).join('\n'), /不得把亲近变成惩罚、交换条件或宽恕测试/);
  assert.equal(resolvedBoundaryReplyViolation(focus, promptTurns, '抱可以，但别拿这个当没事了，下次还是得提前说。'), 'RESOLVED_BOUNDARY_REOPENED');
  assert.equal(resolvedBoundaryReplyViolation(focus, promptTurns, '行，过来吧，早就没板着脸了。'), null);

  const slowRecovery = buildPersonalityTurnFocus({
    personalityNote: note('脾气来得快：有触发才不满；表达直接：点明问题；重视边界：说清期待；嘴硬心软：用行动缓和'),
    promptTurns, previousState: null,
  });
  assert.equal(slowRecovery?.primary.label, '嘴硬心软');
  assert.equal(slowRecovery?.secondary, null);
  assert.match(personalityTurnFocusEnvelope(slowRecovery!).reply_shape, /亲自参与当前亲近/);
  assert.equal(resolvedBoundaryReplyViolation(slowRecovery, promptTurns, '抱就抱，不过别以为这事就翻篇了。'), 'RESOLVED_BOUNDARY_REOPENED');
});
