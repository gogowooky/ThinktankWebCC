import { TTCollection } from './TTCollection';
import { TTObject } from './TTObject';
import { TTState } from './TTState';
import { PanelNames, PanelModes } from '../types';

export class TTStatus extends TTCollection {

    public override get ClassName(): string {
        return 'TTStatus';
    }

    constructor() {
        super();
        this.Description = 'Status'; // Default Description

        this.ItemSaveProperties = "ID,Name,Value,UpdateDate";
        this.ListPropertiesMin = "ID,Value";
        this.ListProperties = "ID,Value";
        this.ColumnMapping = "ID:ステータスID,Name:簡易説明,Value:設定値";
        this.ColumnMaxWidth = "ID:25,Name:40,Value:20";

    }

    public ApplyValue(id: string, value: string): void {
        try {
            const item = this.GetItem(id);
            if (item && item instanceof TTState) {
                item.Apply(value);
            } else {
                console.warn(`TTStatus: ApplyValue item not found: ${id}`);
            }
        } catch (e) {
            console.error(`TTStatus: ApplyValue error id:${id} value:${value}`, e);
        }
    }

    public SetValue(id: string, value: string): void {
        try {
            const item = this.GetItem(id);
            if (item && item instanceof TTState) {
                const val = item.Value;
                if (val !== value) {
                    item.Value = value;
                    item.NotifyUpdated();
                    this.NotifyUpdated();
                }
            } else {
                // If item doesn't exist, maybe we should create it? 
                // In PowerShell version, New-TTState is used to create items.
                // Here SetValue seems to assume existence or just update value.
                // For safety if item is missing we could log or ignore.
                console.warn(`TTStatus: SetValue failed, item not found or invalid: ${id}`);
            }
        } catch (e) {
            console.error(`TTStatus: SetValue error id:${id} value:${value}`, e);
        }
    }

    public RegisterState(id: string, description: string, config: string | any, pcName: string = '*' /* TODO: Env check */): void {
        try {
            // Wildcard expansion for [Panels]
            if (id.includes('[Panels]')) {
                PanelNames.forEach(panelName => {
                    const _id = id.replace('[Panels]', panelName);
                    const _desc = description.replace('[Panels]', panelName);
                    this.RegisterState(_id, _desc, config, pcName);
                });
                return;
            }
            // Wildcard expansion for [Modes]
            if (id.includes('[Modes]')) {
                PanelModes.forEach(modeName => {
                    const _id = id.replace('[Modes]', modeName);
                    const _desc = description.replace('[Modes]', modeName);
                    this.RegisterState(_id, _desc, config, pcName);
                });
                return;
            }

            // Create and add state
            const state = new TTState(id, description, config);
            this.AddItem(state);

        } catch (e) {
            console.error(`TTStatus: RegisterState error ${id}`, e);
        }
    }

    public GetValue(id: string): string {
        const item = this.GetItem(id);
        if (item && item instanceof TTState) {
            return item.Value;
        }
        return '';
    }

    public async LoadCache(): Promise<void> {
        await super.LoadCache();
        // Loaded values need to be applied to the view/logic
        for (const item of this.GetItems()) {
            if (item instanceof TTState) {
                // Apply the loaded value
                item.Apply(item.Value);
            }
        }
    }

    protected CreateChildInstance(): TTObject {
        return new TTState();
    }
}
