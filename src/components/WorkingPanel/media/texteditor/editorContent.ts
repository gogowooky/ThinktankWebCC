import type { MediaProps } from '../types';
import { splitContent } from '../../../../utils/thinkFormat';
import { editorValueIncludesTitleLine } from '../../../../utils/markdownSections';
import { parseRawThinkText, rawFieldsToContent, toRawThinkText } from '../../../../utils/rawThinkText';

function extractBody(content: string): string {
  return splitContent(content).body;
}

export function getEditorValue(think: NonNullable<MediaProps['think']>, rawYaml = false): string {
  if (rawYaml) return toRawThinkText(think);
  return editorValueIncludesTitleLine(think.ContentType)
    ? (think.Content ?? '')
    : extractBody(think.Content);
}

export function reconstructContent(think: NonNullable<MediaProps['think']>, body: string, rawYaml = false): string | null {
  if (rawYaml) {
    const fields = parseRawThinkText(body);
    if ('error' in fields) return null;
    if (fields.keywords !== think.Keywords || fields.relatedIds !== think.RelatedIDs) {
      think.Keywords = fields.keywords;
      think.RelatedIDs = fields.relatedIds;
      think.markFieldsDirty();
    }
    think.Metadata = fields.metadata;
    return rawFieldsToContent(fields);
  }
  if (editorValueIncludesTitleLine(think.ContentType)) return body;
  const firstLine = think.Content.split('\n')[0] ?? '';
  return body ? `${firstLine}\n${body}` : firstLine;
}
