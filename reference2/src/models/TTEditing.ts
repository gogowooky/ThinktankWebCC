// TTEditing.ts
// 編集履歴やメモ毎の環境設定を保存するモデル

import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';

/**
 * TTEditing - 個別メモの編集設定
 * メモIDをキーとして、カーソル位置・ワードラップ・折りたたみ状態・キーワードを保存
 */
export class TTEditing extends TTObject {
    // カーソル位置（1始まり）
    public CaretPos: number = 1;

    // カーソル列位置（1始まり）
    public CaretColumn: number = 1;

    // ワードラップ設定
    public WordWrap: boolean = false;

    // 折りたたみ状態（折りたたまれた行番号をカンマ区切りで保存）
    public Foldings: string = '';

    // キーワードハイライト設定
    public Keywords: string = '';

    // キーワードカラーモード
    public KeywordColorMode: string = 'Default';

    public override get ClassName(): string {
        return 'TTEditing';
    }

    constructor() {
        super();
        this.ID = '';
        this.Name = '';
        this.UpdateDate = this.getNowString();
    }
}

/**
 * TTEditings - 編集設定コレクション
 * メモIDをキーとしてTTEditingを管理
 */
export class TTEditings extends TTCollection {
    constructor() {
        super();
        this.ID = 'Editings';
        this.Name = '編集設定';
        this.Description = 'メモ毎の編集設定';

        // キャッシュ保存用プロパティ設定
        this.ItemSaveProperties = 'ID,UpdateDate,CaretPos,CaretColumn,WordWrap,Foldings,Keywords,KeywordColorMode';
        this.ListPropertiesMin = 'ID,UpdateDate';
        this.ListProperties = 'ID,UpdateDate,CaretPos,CaretColumn,WordWrap,KeywordColorMode,Keywords,Foldings';
        this.ColumnMapping = 'ID:メモID,CaretPos:行,CaretColumn:列,WWrap:ワードラップ,Foldings:折りたたみ,Keywords:キーワード,KeywordColorMode:カラーモード';
        this.ColumnMaxWidth = "ID:20,UpdateDate:20,CaretPos:6,CaretColumn:6,Count:7,Name:40,Description:100";
    }

    public override get ClassName(): string {
        return 'TTEditings';
    }

    protected CreateChildInstance(): TTObject {
        return new TTEditing();
    }

    /**
     * 指定メモIDの編集設定を取得、存在しなければ作成
     */
    public GetOrCreate(memoId: string): TTEditing {
        let editing = this.GetItem(memoId) as TTEditing | undefined;
        if (!editing) {
            editing = new TTEditing();
            editing.ID = memoId;
            editing.Name = memoId;
            this.AddItem(editing);
        }
        return editing;
    }

    /**
     * 指定メモIDの編集設定を更新
     */
    public UpdateEditing(
        memoId: string,
        options: {
            caretPos?: number;
            caretColumn?: number;
            wordWrap?: boolean;
            foldings?: string;
            keywords?: string;
            keywordColorMode?: string;
        }
    ): TTEditing {
        const editing = this.GetOrCreate(memoId);

        if (options.caretPos !== undefined) {
            editing.CaretPos = options.caretPos;
        }
        if (options.caretColumn !== undefined) {
            editing.CaretColumn = options.caretColumn;
        }
        if (options.wordWrap !== undefined) {
            editing.WordWrap = options.wordWrap;
        }
        if (options.foldings !== undefined) {
            editing.Foldings = options.foldings;
        }
        if (options.keywords !== undefined) {
            editing.Keywords = options.keywords;
        }
        if (options.keywordColorMode !== undefined) {
            editing.KeywordColorMode = options.keywordColorMode;
        }

        // 現在時刻を設定
        const now = new Date();
        editing.UpdateDate = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
        editing.NotifyUpdated();
        return editing;
    }
}
