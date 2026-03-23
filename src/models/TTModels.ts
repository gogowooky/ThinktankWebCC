import { TTCollection } from './TTCollection';
import { TTStatus } from './TTStatus';
import { TTActions } from './TTAction';
import { TTEvents } from './TTEvent';
import { TTMemos } from './TTMemos';
import { TTChats } from './TTChats';
import { TTRequests } from './TTRequest';
import { TTEditings } from './TTEditing';
import { InitializeDefaultStatus } from '../Controllers/DefaultStatus';
import { InitializeDefaultActions } from '../Controllers/DefaultActions';
import { InitializeDefaultEvents } from '../Controllers/DefaultEvents';
import { InitializeDefaultRequests } from '../Controllers/DefaultRequests';

export class TTModels extends TTCollection {
    public Status: TTStatus;
    public Actions: TTActions;
    public Events: TTEvents;
    public Memos: TTMemos;
    public Chats: TTChats;    // Phase 11 段120
    public Requests: TTRequests;
    public Editings: TTEditings;

    private static _instance: TTModels;

    public override get ClassName(): string {
        return 'TTModels';
    }

    private constructor() {
        super();
        TTModels._instance = this;
        this.ID = 'Thinktank';
        this.Name = 'Thinktank';
        this.Description = 'Collection List';

        this.ItemSaveProperties = "ID,Name,Count,Description";
        this.ListPropertiesMin = "ID,Count,Name";
        this.ListProperties = "ID,Name,Count,Description";
        this.ColumnMapping = "ID:コレクションID,Name:コレクション名,Count:アイテム数,Description:説明";
        this.ColumnMaxWidth = "ID:11,Count:7,Name:40,Description:100";


        // Setup initial collections
        this.Status = new TTStatus();
        this.Status.ID = "Status";
        this.Status.Name = "ステータス";

        this.Actions = new TTActions(this);
        this.Actions.ID = "Actions";
        this.Actions.Name = "アクション";

        this.Events = new TTEvents();
        this.Events.ID = "Events";
        this.Events.Name = "イベント";

        this.Memos = new TTMemos();
        this.Memos.ID = "Memos";
        this.Memos.Name = "メモ";

        this.Chats = new TTChats();
        this.Chats.ID = "Chats";
        this.Chats.Name = "チャット";

        this.Requests = new TTRequests(this);
        this.Requests.ID = "Requests";
        this.Requests.Name = "リクエスト";

        this.Editings = new TTEditings();
        this.Editings.ID = "Editings";
        this.Editings.Name = "編集設定";

        this.AddItem(this.Status);
        this.AddItem(this.Actions);
        this.AddItem(this.Events);
        this.AddItem(this.Memos);
        this.AddItem(this.Chats);
        this.AddItem(this.Requests);
        this.AddItem(this.Editings);

        // Initialize Default Status & Actions & Events & Requests
        InitializeDefaultStatus(this);
        InitializeDefaultActions(this);
        InitializeDefaultEvents(this);
        InitializeDefaultRequests(this);

        // Load Cache
        this.Status.LoadCache();
        this.Actions.LoadCache();
        this.Events.LoadCache();
        this.Memos.LoadCache();
        this.Chats.LoadCache();
        this.Requests.LoadCache();
        this.Editings.LoadCache();
        this.LoadCache();
    }

    public static get Instance(): TTModels {
        if (!this._instance) {
            this._instance = new TTModels();
        }
        return this._instance;
    }

    public override async LoadCache(): Promise<void> {
        this.IsLoaded = true;
    }
}
