import { TTObject } from './TTObject';
import { TTCollection } from './TTCollection';

export class TTEvent extends TTObject {
    public Context: string = '';
    public Mods: string = '';
    public Key: string = '';

    public override get ClassName(): string {
        return 'TTEvent';
    }

    constructor() {
        super();
        this.ID = '';           // Context|Mods|Key
        this.Name = '';         // ActionID
        this.UpdateDate = 'init'; // Placeholder for Get-TTID init
        this.Context = '';      // Panel-Mode-Tool-Context
        this.Mods = '';
        this.Key = '';

        this.Context = '';      // Panel-Mode-Tool-Context
        this.Mods = '';
        this.Key = '';
    }
}

export class TTEvents extends TTCollection {
    constructor() {
        super();
        this.ItemSaveProperties = "Context,Mods,Key,ID,Name,UpdateDate";
        this.ListPropertiesMin = "ID,Name";
        this.ListProperties = "Mods,Key,Name,Context";
        this.ColumnMapping = "ID:イベントID,Context:コンテキスト,Mods:修飾キー,Key:キー,Name:アクション";
        this.ColumnMaxWidth = "ID:20,Context:18,Mods:11,Key:10,Name:34";

    }

    public override get ClassName(): string {
        return 'TTEvents';
    }

    public override async LoadCache(): Promise<void> {
        this.IsLoaded = true;
    }
}
