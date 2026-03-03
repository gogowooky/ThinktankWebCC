import type { TTModels } from '../models/TTModels';
import { TTRequest } from '../models/TTRequest';

/**
 * デフォルトのリクエスト定義を初期化します
 */
export function InitializeDefaultRequests(models: TTModels): void {
    const requests = models.Requests;

    // ヘルパー関数: リクエストの追加
    function AddRequest(id: string, name: string, determinant: string, color?: string, fontWeight?: string): TTRequest {
        const request = new TTRequest();
        request.ID = id;
        request.Name = name;
        request.Determinant = determinant;
        request.Color = color || '';
        request.FontWeight = fontWeight || '';
        requests.AddItem(request);
        return request;
    }

    // #region === Model Request ===
    // 正規表現のエスケープ: \[ → \\[, \] → \\], [^\]] → [^\\]]
    AddRequest('Editor', 'エディター上表示',
        '\\[' + '(?<tag>TTMemo:(?<id>[^\\]]+))' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Table', 'テーブル上表示',
        '\\[' + '(?<tag>TTModels|TTActions|TTEvents|TTMemos|TTRequests|TTStatus)' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Import', '外部データ',
        '\\[' + '(?<class>Clipboard|DragDrop)' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Url', 'URL',
        '(' + '(?<http>https?://[^") ]+)|' + ')',
        '#12abe2ff', 'normal'
    );
    AddRequest('RelUrl', '相対URL',
        '┗ (' + '(?<path>\/([^<>:\\" \\|\\?\\*]+)*)|' + ')',
        '#12abe2ff', 'normal',
    );
    AddRequest('Path', 'パス',
        '(' +
        '(?<file>(([a-zA-Z]:\\\\)|\\\\\\\\)([^<>:\\" \\|\\?\\*]+\\\\?)*)|' +
        '"(?<fileq>(([a-zA-Z]:\\\\)|\\\\\\\\)([^<>:\\"\\|\\?\\*]+\\\\?)*)"' +
        ')',
        '#12abe2ff', 'normal'
    );
    AddRequest('RelPath', '相対パス',
        // '^(?<=\\s*)(' +
        '┗ (' +
        '(?<path>\\\\([^<>:\\" \\|\\?\\*]+\\\\?)*)|' +
        '"(?<pathq>\\\\([^<>:\\"\\|\\?\\*]+\\\\?)*)"' +
        ')',
        '#12abe2ff', 'normal'
    );
    AddRequest('Icon', 'アイコン',
        '\\[(' +
        '(?<i1>1|未|待|続|済|要|催)|' +
        '(?<i2>2|TODO|WAIT||DOING|DONE|NEED|EVENT)|' +
        '(?<i3>3| |o|x|-|=)' +
        ')\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Reference', '参照',
        '\\[' + '(?<scope>>|>>|:)(?<tag>[^\\]]+)' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('WebSearch', 'Web検索',
        '\\[' + '(?<cite>Google|Wikipedia|Pubmed)' + ':(?<keyword>[^\\]]+)' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Route', '旅程ルート',
        '\\[' + '(?<tag>Route)' + ':(?<param1>[^\\>:\\]]+)' + '(:(?<param2>[\\w]+))?' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Memo', 'メモ',
        '\\[' + 'Memo:' + '(?<param1>[^\\>:\\]]+)' + '(:(?<param2>[\\w]+))?' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('ThinkTank', 'アプリタグ',
        '\\[' + '(?<tag>Mail|Set|Photo)' + ':(?<param1>[^\\>:\\]]+)' + '(:(?<param2>[\\w]+))?' + '\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Chat', 'AIチャットログ',
        '^\\[' + '(?<tag>Gemini|Claude|ChatGPT)>' + '\\]' + '(?<chat>.*)',
        '#12abe2ff', 'normal'
    );
    AddRequest('DateTag', '日付タグ',
        '\\[(?<y>\\d{4})\\-(?<m>\\d{2})\\-(?<d>\\d{2})\\]',
        '#12abe2ff', 'normal'
    );
    AddRequest('Date', '日付',
        '(?<y>\\d{4})\\/(?<m>\\d{1,2})\\/(?<d>\\d{1,2})' + '(\\((?<w>[日月火水木金土])\\))?' + '( (?<h>\\d{2}):(?<n>\\d{2}))?',
        '#12abe2ff', 'normal'
    );
    AddRequest('JDate', '日付',
        '(?<y>\\d{4})年' + '(?<m>\\d{1,2})月' + '(?<d>\\d{1,2})日' + '(\\((?<w>[日月火水木金土])\\))?' + '( (?<h>\\d{2}):(?<n>\\d{2}))?',
        '#12abe2ff', 'normal'
    );
    AddRequest('GDate', '日付',
        '(?<g>明治|大正|昭和|平成|令和)(?<y>\\d{1,2}|元)年' + '(?<m>\\d{1,2})月' + '(?<d>\\d{1,2})日' + '(\\((?<w>[日月火水木金土])\\))?' + '( (?<h>\\d{2}):(?<n>\\d{2}))?',
        '#12abe2ff', 'normal'
    );
    // #endregion


}
