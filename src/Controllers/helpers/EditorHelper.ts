
import { TTApplication } from '../../Views/TTApplication';

export class EditorHelper {
    /**
     * 指定されたプレフィックスリストを循環して行頭文字を変更します。
     * @param direction 'next' または 'prev'
     * @param prefixes 循環するプレフィックスの配列（最後の要素は通常空文字列 ''）
     * @param undoId Undoスタック用のID
     */
    private static performPrefixChange(direction: 'next' | 'prev', prefixes: string[], undoId: string): void {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (!panel?.Editor?.Handle) return;

        const editor = panel.Editor.Handle.getEditor();
        if (!editor) return;

        const model = editor.getModel();
        if (!model) return;

        const selections = editor.getSelections();
        if (!selections || selections.length === 0) return;

        const edits: any[] = [];

        // Process all lines in all selections
        for (const selection of selections) {
            let startLine = selection.startLineNumber;
            let endLine = selection.endLineNumber;

            // Adjust end line if selection ends at column 1 of the next line (unless it's the same line)
            if (endLine > startLine && selection.endColumn === 1) {
                endLine--;
            }

            for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
                const lineContent = model.getLineContent(lineNum);

                // Identify indent
                const indentMatch = lineContent.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : '';
                const contentAfterIndent = lineContent.substring(indent.length);

                // Identify current prefix
                let currentIndex = prefixes.length - 1; // Default to last (usually '', no prefix)

                // Check non-empty prefixes
                for (let i = 0; i < prefixes.length - 1; i++) {
                    if (contentAfterIndent.startsWith(prefixes[i])) {
                        currentIndex = i;
                        break;
                    }
                }

                // Calculate next index
                let nextIndex;
                if (direction === 'next') {
                    nextIndex = (currentIndex + 1) % prefixes.length;
                } else {
                    nextIndex = (currentIndex - 1 + prefixes.length) % prefixes.length;
                }

                const currentPrefix = prefixes[currentIndex];
                const nextPrefix = prefixes[nextIndex];

                if (currentPrefix === nextPrefix) continue;

                // Create edit: replace [indent + currentPrefix] with [indent + nextPrefix]

                const startColumn = 1 + indent.length;
                const endColumn = startColumn + currentPrefix.length;

                edits.push({
                    range: {
                        startLineNumber: lineNum,
                        startColumn: startColumn,
                        endLineNumber: lineNum,
                        endColumn: endColumn
                    },
                    text: nextPrefix,
                    forceMoveMarkers: true
                });
            }
        }

        if (edits.length > 0) {
            editor.executeEdits(undoId, edits);
        }
    }

    public static performBulletChange(direction: 'next' | 'prev'): void {
        const bullets = ['・ ', '- ', '* ', '→ ', '↓ ', ''];
        this.performPrefixChange(direction, bullets, 'Editor.Edit.Bullet');
    }

    public static performCommentChange(direction: 'next' | 'prev'): void {
        const comments = ['; ', '> ', '>> ', '| ', ''];
        this.performPrefixChange(direction, comments, 'Editor.Edit.Comment');
    }

    public static performTabChange(action: 'add' | 'remove'): void {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (!panel?.Editor?.Handle) return;

        const editor = panel.Editor.Handle.getEditor();
        if (!editor) return;

        if (action === 'add') {
            editor.trigger('keyboard', 'editor.action.indentLines', null);
        } else {
            editor.trigger('keyboard', 'editor.action.outdentLines', null);
        }
    }
}
