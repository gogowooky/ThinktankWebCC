import type { TTModels } from '../models/TTModels';
import { TTRequest } from '../models/TTRequest';

/**
 * デフォルトのリクエスト定義を初期化します
 */
export function InitializeDefaultRequests(models: TTModels): void {
    const requests = models.Requests;

    // ヘルパー関数: リクエストの追加
    function AddRequest(id: string, name: string, determinant: string): TTRequest {
        const request = new TTRequest();
        request.ID = id;
        request.Name = name;
        request.Determinant = determinant;
        requests.AddItem(request);
        return request;
    }

    // #region === Model Request ===
    // 正規表現のエスケープ: \[ → \\[, \] → \\], [^\]] → [^\\]]
    AddRequest('Editor', 'エディター上表示',
        '\\[' + '(?<tag>TTMemo:(?<id>[^\\]]+))' + '\\]'
    );
    AddRequest('Table', 'テーブル上表示',
        '\\[' + '(?<tag>TTModels|TTActions|TTEvents|TTMemos|TTRequests|TTStatus)' + '\\]'
    );
    AddRequest('Import', '外部データ',
        '\\[' + '(?<class>Clipboard|DragDrop)' + '\\]'
    );
    AddRequest('Url', 'URL',
        '(' + '(?<http>https?://[^") ]+)|' + ')'
    );
    AddRequest('RelUrl', '相対URL',
        '┗ (' + '(?<path>\/([^<>:\\" \\|\\?\\*]+)*)|' + ')'
    );
    AddRequest('Path', 'パス',
        '(' +
        '(?<file>(([a-zA-Z]:\\\\)|\\\\\\\\)([^<>:\\" \\|\\?\\*]+\\\\?)*)|' +
        '"(?<fileq>(([a-zA-Z]:\\\\)|\\\\\\\\)([^<>:\\"\\|\\?\\*]+\\\\?)*)"' +
        ')'
    );
    AddRequest('RelPath', '相対パス',
        // '^(?<=\\s*)(' +
        '┗ (' +
        '(?<path>\\\\([^<>:\\" \\|\\?\\*]+\\\\?)*)|' +
        '"(?<pathq>\\\\([^<>:\\"\\|\\?\\*]+\\\\?)*)"' +
        ')'
    );
    AddRequest('Icon', 'アイコン',
        '\\[(' +
        '(?<i1>1|未|待|続|済|要|催)|' +
        '(?<i2>2|TODO|WAIT||DOING|DONE|NEED|EVENT)|' +
        '(?<i3>3| |o|x|-|=)' +
        ')\\]'
    );
    AddRequest('Reference', '参照',
        '\\[' + '(?<scope>>|>>|:)(?<tag>[^\\]]+)' + '\\]'
    );
    AddRequest('WebSearch', 'Web検索',
        '\\[' + '(?<cite>Google|Wikipedia|Pubmed)' + ':(?<keyword>[^\\]]+)' + '\\]'
    );
    AddRequest('Route', '旅程ルート',
        '\\[' + '(?<tag>Route)' + ':(?<param1>[^\\>:\\]]+)' + '(:(?<param2>[\\w]+))?' + '\\]'
    );
    AddRequest('Memo', 'メモ',
        '\\[' + 'Memo:' + '(?<param1>[^\\>:\\]]+)' + '(:(?<param2>[\\w]+))?' + '\\]'
    );
    AddRequest('ThinkTank', 'アプリタグ',
        '\\[' + '(?<tag>Mail|Set|Photo)' + ':(?<param1>[^\\>:\\]]+)' + '(:(?<param2>[\\w]+))?' + '\\]'
    );
    AddRequest('Chat', 'AIチャットログ',
        '^\\[' + '(?<tag>Gemini|Claude|ChatGPT)>' + '\\]' + '(?<chat>.*)'
    );
    AddRequest('DateTag', '日付タグ',
        '\\[(?<y>\\d{4})\\-(?<m>\\d{2})\\-(?<d>\\d{2})\\]'
    );
    AddRequest('Date', '日付',
        '(?<y>\\d{4})\\/(?<m>\\d{1,2})\\/(?<d>\\d{1,2})' + '(\\((?<w>[日月火水木金土])\\))?' + '( (?<h>\\d{2}):(?<n>\\d{2}))?'
    );
    AddRequest('JDate', '日付',
        '(?<y>\\d{4})年' + '(?<m>\\d{1,2})月' + '(?<d>\\d{1,2})日' + '(\\((?<w>[日月火水木金土])\\))?' + '( (?<h>\\d{2}):(?<n>\\d{2}))?'
    );
    AddRequest('GDate', '日付',
        '(?<g>明治|大正|昭和|平成|令和)(?<y>\\d{1,2}|元)年' + '(?<m>\\d{1,2})月' + '(?<d>\\d{1,2})日' + '(\\((?<w>[日月火水木金土])\\))?' + '( (?<h>\\d{2}):(?<n>\\d{2}))?'
    );
    // #endregion


}
