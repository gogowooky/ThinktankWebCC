import { TTObject } from './TTObject';

export interface TTStateConfig {
    Default?: (id: string) => string;
    Test?: (id: string, value: string) => boolean;
    Apply?: (id: string, value: string) => void;
    Watch?: (id: string) => void;
    Calculate?: (id: string) => string;
}

export class TTState extends TTObject {
    private _value: string = '';
    public Description: string;

    protected _stored_value: string = '';
    protected _default: (id: string) => string = () => '';
    protected _test: (id: string, value: string) => boolean = () => true;
    protected _apply_to_view: (id: string, value: string) => void = () => { };
    protected _event_initiator: (id: string) => void = () => { };
    protected _calculate_value: ((id: string) => string) | null = null;

    public override get ClassName(): string {
        return 'TTState';
    }

    constructor(id: string = '', description: string = '', config?: string | TTStateConfig) {
        super();
        this.ID = id;
        this.Name = id;
        this.Description = description;
        this.UpdateDate = this.getNowString();

        if (typeof config === 'string') {
            this._value = config;
            this._default = () => config;
        } else if (config) {
            this._default = config.Default || (() => '');
            this._value = this._default(this.ID);
            this._test = config.Test || (() => true);
            this._apply_to_view = config.Apply || (() => { });
            this._event_initiator = config.Watch || (() => { });
            this._calculate_value = config.Calculate || null;
        } else {
            this._value = '';
        }

        // Execute Watch/event_initiator to start monitoring
        this._event_initiator(this.ID);
    }

    /**
     * 値を取得する
     * _calculate_value が設定されている場合はその計算結果を返す
     * 設定されていない場合は格納された値を返す
     */
    public get Value(): string {
        if (this._calculate_value) {
            return this._calculate_value(this.ID);
        }
        return this._value;
    }

    /**
     * 値を設定する
     */
    public set Value(value: string) {
        this._value = value;
    }

    public Apply(value: string): void {
        this._apply_to_view(this.ID, value);
    }
}
