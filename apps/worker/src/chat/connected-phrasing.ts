/** One conservative prosody candidate: keep words and question boundaries,
 * but connect a short acknowledgement to its immediate declarative follow-up.
 * Input must already be normalized by the stable text boundary.
 */
export function connectShortAcknowledgement(text: string): string {
  if (!text || /[?!？！…\n\r:：;；“”‘’「」『』"'<>]/u.test(text)) return text;
  const pair = text.match(/^([^。]{1,22})。([^。]{1,28})。?$/u);
  if (!pair) return text;
  const [, first, second] = pair;
  if (!/^(?:行|好|好的|知道了|可以|嗯|明白了)[，,]/u.test(first)) return text;
  if (Array.from(first + second).length > 44) return text;
  // Preserve boundaries around an explicit refusal, instruction, or closure.
  if (/(?:别|不要|不许|不准|闭嘴|不管了|不聊了|到此为止|就这样)/u.test(first + second)) return text;
  return `${first}，${second}${text.endsWith('。') ? '。' : ''}`;
}
