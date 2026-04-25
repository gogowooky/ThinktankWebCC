export class TTObject {
    public _parent: TTObject | null = null;
    protected _flag: string = 'false';
    public ID: string = '';
    public Name: string = '';
    public UpdateDate: string = '';

    private _updateListeners: Map<string, () => void> = new Map();

    constructor() {
        this.ID = this.ClassName.replace(/^TT/, '');
        this.Name = this.ClassName.replace(/^TT/, '');
        this.UpdateDate = this.getNowString();
    }

    public get ClassName(): string {
        return 'TTObject';
    }

    public NotifyUpdated(updateDate: boolean = true): void {
        if (updateDate) {
            this.UpdateDate = this.getNowString();
        }
        // Notify listeners
        this._updateListeners.forEach(callback => callback());
        // 親コレクションにも通知を伝播（Tableの更新などに必要）
        if (this._parent) {
            this._parent.NotifyUpdated();
        }
    }

    public AddOnUpdate(key: string, callback: () => void): void {
        this._updateListeners.set(key, callback);
    }

    public RemoveOnUpdate(key: string): void {
        this._updateListeners.delete(key);
    }

    protected getNowString(): string {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}-${hh}${min}${ss}`;
    }
}
