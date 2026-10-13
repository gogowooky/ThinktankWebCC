import type { ConversationTurn } from './conversationRecord.js';

/** Shared by the conversation view and the saved Chat transcript. */
export function conversationPresentation(turn: ConversationTurn) {
  let reply = turn.answer.reply;
  const links = turn.answer.citations.map((citation, index) => {
    const source = turn.context.sources.find(source => source.thinkId === citation.thinkId);
    // Context source content includes the title line. Offsets are verified at generation/save.
    const line = (source?.content.slice(0, citation.start).match(/\r\n|\r|\n/g)?.length ?? 0) + 1;
    const marker = `[Think:${citation.thinkId},${line}]`;
    // Provider markers remain positional internally; the app computes exact source lines.
    reply = reply.split(`[:>${index + 1}]`).join(marker);
    // Older replies have no markers. Attach to an exact quote when possible;
    // otherwise retain the verified quotation rather than guessing its paraphrase.
    if (!reply.includes(marker)) {
      const offset = reply.indexOf(citation.quote);
      if (offset >= 0) {
        const end = offset + citation.quote.length;
        reply = `${reply.slice(0, end)}${marker}${reply.slice(end)}`;
      } else {
        reply += `\n「${citation.quote}」${marker}`;
      }
    }
    return { marker, thinkId: citation.thinkId, line };
  });
  return { reply, links };
}
