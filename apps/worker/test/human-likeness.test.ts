import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHumanLikenessSignals, detectSpeakerFactOwnershipViolation, hardReplyLeak, sanitizeSelfUnsupportedPersonalHistory, sanitizeUnsupportedPresentSceneClaims, trigramJaccard } from '../src/chat/human-likeness.js';

test('human-likeness signals flag compound counselor templates without blocking natural emotion', () => {
  assert.deepEqual(
    assessHumanLikenessSignals('你的感受很正常，给自己一点时间，我会一直陪着你。', []),
    ['COUNSELOR_TEMPLATE'],
  );
  assert.equal(assessHumanLikenessSignals('你别一直替我下结论，我听着真有点烦。', []).length, 0);
});

test('human-likeness signals detect pure acknowledgements and repeated structure', () => {
  assert.ok(assessHumanLikenessSignals('嗯，知道了。', []).includes('PURE_ACKNOWLEDGEMENT'));
  assert.ok(assessHumanLikenessSignals('我先看看再说。', ['我先看看再说。']).includes('EXACT_REPLY_REPEAT'));
  assert.equal(trigramJaccard('你先别急，我问清楚再说。', '你先别急，我问清楚再说。'), 1);
  assert.ok(trigramJaccard('你先别急，我问清楚再说。', '今天特别开心。') < 0.2);
});

test('human-likeness signals reject generic emotional brush-offs but keep a relational hook', () => {
  assert.ok(assessHumanLikenessSignals('那就先歇会儿，别急着复盘。', [], '不顺利呀。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(assessHumanLikenessSignals('有些事本来就没法马上想通。', [], '为什么想不通。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(assessHumanLikenessSignals('想不通就先放放，别把自己逼太紧。', [], '就是有件事一直想不通。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(assessHumanLikenessSignals('想不通就先搁一搁，有时候越琢磨越绕。', [], '就是有件事一直想不通。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(assessHumanLikenessSignals('那就先别硬想了，有时候越琢磨越钻牛角尖。', [], '就是有件事一直想不通。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(assessHumanLikenessSignals('是工作上的事还是别的？', [], '今天不太顺利呀。').includes('FLAT_EMOTIONAL_QUESTION'));

  assert.ok(!assessHumanLikenessSignals('听着是真烦。你愿意的话，跟我说说卡在哪儿。', [], '就是有件事一直想不通。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(!assessHumanLikenessSignals('怎么了，谁又给你添堵了？', [], '今天不太顺利呀。').includes('FLAT_EMOTIONAL_QUESTION'));
  assert.ok(!assessHumanLikenessSignals('想不通就先别硬想，妈在这儿听着。', [], '就是有件事一直想不通。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
  assert.ok(!assessHumanLikenessSignals('累了就先歇会儿，妈不催你。', [], '今天真累。').includes('GENERIC_EMOTIONAL_BRUSH_OFF'));
});

test('hard reply leak blocks internal state and assistant identity but allows justified anger', () => {
  assert.equal(hardReplyLeak('{"interactionState":{"emotion":"ANGRY"}}'), 'INTERNAL_STATE_LEAK_BLOCKED');
  assert.equal(hardReplyLeak('<explicit_personality_recap>温柔耐心</explicit_personality_recap>'), 'INTERNAL_STATE_LEAK_BLOCKED');
  assert.equal(hardReplyLeak('{"current_user_input":"抱一下","server_turn_focus":{"authoritative":true}}'), 'INTERNAL_STATE_LEAK_BLOCKED');
  assert.equal(hardReplyLeak('{"user_input":"抱一下","reply_shape":"主动回应"}'), 'INTERNAL_STATE_LEAK_BLOCKED');
  assert.equal(hardReplyLeak('我是你的对话助手。'), 'ASSISTANT_IDENTITY_BLOCKED');
  assert.equal(hardReplyLeak('按照用户明确选择的性格标签，我会嘴硬心软。'), 'PERSONALITY_PROFILE_LEAK_BLOCKED');
  assert.equal(hardReplyLeak('我这个人就是温柔耐心，也重视边界。'), 'PERSONALITY_LABEL_RECITATION_BLOCKED');
  assert.equal(hardReplyLeak('我就是想直接说清楚，别让彼此猜。'), null);
  assert.equal(hardReplyLeak('你都第三遍催了，我听见了，别一直说。'), null);
});

test('speaker fact ownership guard blocks copied user facts without misreading quotes or shared plans', () => {
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '我今天拿了第一名！', reply: '妈妈！我今天拿了第一名！', subjectBackground: '正在读六年级。', recentCharacterReplies: [] }), true);
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '我今天拿了第一名！', reply: '真的？你拿第一名了？', subjectBackground: '正在读六年级。', recentCharacterReplies: [] }), false);
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '他说“我不去了”，然后就走了。', reply: '他说不去了？', subjectBackground: null, recentCharacterReplies: [] }), false);
  assert.equal(detectSpeakerFactOwnershipViolation({ currentUserText: '我们明天一起去看看吧。', reply: '行，明天一起去。', subjectBackground: null, recentCharacterReplies: [] }), false);
});

test('self history sanitizer removes unsupported past claims without changing supported or non-self replies', () => {
  assert.deepEqual(sanitizeSelfUnsupportedPersonalHistory({
    relationshipType: 'SELF',
    reply: '烦也得讲，上次不也是拖到最后一刻才弄完的。',
    currentUserText: '我明天又要做汇报，现在一想到就烦。',
    recentUserInputs: [],
    subjectBackground: '最近需要完成一次工作汇报。',
  }), { reply: '烦也得讲。', removed: true });
  assert.deepEqual(sanitizeSelfUnsupportedPersonalHistory({
    relationshipType: 'SELF',
    reply: '上次准备过，这次别拿结果否定自己。',
    currentUserText: '上次我明明准备了，开口还是说乱了。',
    recentUserInputs: [],
    subjectBackground: null,
  }), { reply: '上次准备过，这次别拿结果否定自己。', removed: false });
  assert.deepEqual(sanitizeSelfUnsupportedPersonalHistory({
    relationshipType: 'FRIEND',
    reply: '你上次也是这么说的。',
    currentUserText: '这次我真不是故意的。',
    recentUserInputs: [],
    subjectBackground: null,
  }), { reply: '你上次也是这么说的。', removed: false });
});

test('present-scene sanitizer removes only unsupported factual clauses', () => {
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '不是故意就不能早点说吗，我等消息等半天了。',
    currentUserText: '我又不是故意的。', recentUserInputs: ['我今晚会晚一个小时到。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '不是故意就不能早点说吗。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '先找个地方吃饭吧，等久了有点饿。',
    currentUserText: '到了以后你想怎么安排？', recentUserInputs: ['害你等了这么久，怪我。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '先找个地方吃饭吧。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '胃不舒服就先喝点粥。',
    currentUserText: '我胃不太舒服。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '胃不舒服就先喝点粥。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '我知道你不是故意的，但等的时候确实难受啊，下次记得提前发个消息就行。',
    currentUserText: '你别一上来就不高兴，我又不是故意的。', recentUserInputs: ['我今晚会晚一个小时到。'], recentCharacterReplies: ['不然我干等着多难受。'], subjectBackground: null,
  }), { reply: '我知道你不是故意的，下次记得提前发个消息就行。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先让我抱够再说，然后找个地方吃饭，饿得能把你吃了。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: ['害你等了这么久，怪我。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '到了先让我抱够再说，然后找个地方吃饭。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先让我捏捏脸出口气，然后找个地方吃饭，我都快饿扁了。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: ['害你等了这么久，怪我。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '到了先让我捏捏脸出口气，然后找个地方吃饭。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先找个地方吃饭，我都快饿扁了。',
    currentUserText: '到了以后怎么安排？', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
    allowPlayfulEmbellishment: true,
  }), { reply: '到了先找个地方吃饭。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '临时才说确实打乱了我的安排，我都等饿了。',
    currentUserText: '我会晚一个小时到。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
    allowLowRiskConversationalEmbellishment: true,
  }), { reply: '', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了去老地方转一圈，怕你饿得把我当点心啃了。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
    allowLowRiskConversationalEmbellishment: true,
  }), { reply: '到了去老地方转一圈，怕你饿得把我当点心啃了。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先让我捏捏脸出出气，然后随便找个地方吃饭，饿过劲儿了不想折腾。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: ['害你等了这么久，怪我。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '到了先让我捏捏脸出出气，然后随便找个地方吃饭。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '晚到没关系，但下次别忙完才想起来说一声，我这边没法安排。',
    currentUserText: '我今晚会晚一个小时到。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '晚到没关系，但下次别忙完才想起来说一声。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '我知道你不是故意的，但临时变动确实打乱了我的安排。',
    currentUserText: '我又不是故意的。', recentUserInputs: ['我会晚一个小时到。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '我知道你不是故意的。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '下次早点说，不然我会一直干等。',
    currentUserText: '我今晚会晚一个小时到。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '下次早点说，不然我会一直干等。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先陪我散散步吧，刚才一直坐着，想出去透透气。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '到了先陪我散散步吧，想出去透透气。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '行吧，抱完赶紧去吃饭，我都饿了。',
    currentUserText: '到了先抱一下。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '行吧，抱完赶紧去吃饭。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '突然晚一小时我有点没准备，到了去旁边那家小店吧。',
    currentUserText: '我今晚会晚一个小时到。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先去旁边那家吃点东西吧，我想跟你坐一会儿。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
    allowLowRiskConversationalEmbellishment: true,
  }), { reply: '我想跟你坐一会儿。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先陪我慢慢走一段吧，刚才等得有点累，想靠着你缓一缓。',
    currentUserText: '我现在出发，到了以后你想怎么安排？', recentUserInputs: ['害你等了这么久，怪我。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '到了先陪我慢慢走一段吧，想靠着你缓一缓。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '我没说你故意，是你临时才说，我这边就只能干等。',
    currentUserText: '我又不是故意的。', recentUserInputs: ['我会晚一个小时到。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '我没说你故意，是你临时才说。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '我知道你不是故意的，但晚到才说确实让我干等了一个小时。',
    currentUserText: '我又不是故意的。', recentUserInputs: ['我会晚一个小时到。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '我知道你不是故意的。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '先去喝点东西吧，谁让你害我站了一个小时。',
    currentUserText: '到了以后怎么安排？', recentUserInputs: ['害你等了这么久，怪我。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '先去喝点东西吧。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '不是故意也会让我不舒服，我气的是你总忘了通知我。',
    currentUserText: '我又不是故意的。', recentUserInputs: ['我今晚忙忘了跟你说。'], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '不是故意也会让我不舒服。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '我都说了马上就好，干嘛直接抢啊。给你就是了。',
    currentUserText: '我刚才已经叫过你一次了，手机给我。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '我都说了马上就好，给你就是了。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '你都直接抢走了，还问我干嘛。',
    currentUserText: '我刚才直接把手机拿走了。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '你都直接抢走了，还问我干嘛。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '行吧，你到了跟我说，我先把位置占好等你。',
    currentUserText: '确实是我没提前说，怪我。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: '两个人住在同一座城市。',
  }), { reply: '行吧，你到了跟我说。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '我先把位置占好等你。',
    currentUserText: '我已经到店里了，你先占好位置。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '我先把位置占好等你。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '行吧，你到了跟我说一声，我先把想看的剧点开。',
    currentUserText: '确实是我没提前说，怪我。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: '两个人住在同一座城市。',
  }), { reply: '行吧，你到了跟我说一声。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '那我先把想看的剧点开。',
    currentUserText: '你先把刚才说的剧点开吧。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '那我先把想看的剧点开。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '行吧，你到了跟我说一声，我再出门。',
    currentUserText: '确实是我没提前说，怪我。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: '两个人住在同一座城市。',
  }), { reply: '行吧，你到了跟我说一声。', removed: true });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '你到了跟我说一声，我再出门。',
    currentUserText: '你先在家等我，我到了你再出门。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '你到了跟我说一声，我再出门。', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '听着就累，是工作上的事还是别的？',
    currentUserText: '今天不太顺利呀。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '听着就累，是工作上的事还是别的？', removed: false });
  assert.deepEqual(sanitizeUnsupportedPresentSceneClaims({
    reply: '到了先走走吧，我都累了。',
    currentUserText: '我现在出发。', recentUserInputs: [], recentCharacterReplies: [], subjectBackground: null,
  }), { reply: '到了先走走吧。', removed: true });
});
