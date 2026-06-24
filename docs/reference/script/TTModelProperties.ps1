
# 250523: ReadCacheフラグ造設

Add-TTModelProperty TTObject        @{  
    ChildClassName = ''
    TableHeaders = @{
        _flag = 'フラグ'
        Name =  '名前'
        Index = 'ID'
    }
    TableItems = @{
        All =       '_flag,Name,Index'
        Library =   '_flag,Name'
        Index =     '_flag,Name'
        Shelf =     '_flag,Name'
        Desk =      '_flag,Name'
        System  =   '_flag,Name'
    }
}
Add-TTModelProperty TTCollection    @{
    ChildClassName =    'TTObject'
    Description =       'コレクション'
    NeedCache =         'false'         # キャッシュを読む必要があるかどうか
    TableHeaders = @{
        Count =         '件数' 
        Description =   '説明'
        UpdateDate =    '更新日'
    }   
    TableItems = @{
        All =       'Description,Count,Name,UpdateDate'
        Library =   'Name,Count,Description'
        Index =     'Name,Count,Description'
        Shelf =     'Description,Count,Name,UpdateDate'
        Desk =      'Description,Count,Name,UpdateDate'
        System =    'Description,Count,Name,UpdateDate'
    }
}
Add-TTModelProperty TTModels        @{
    ChildClassName =    'TTCollection'
    Description =       '全一覧'
    NeedCache =         'false'
}
Add-TTModelProperty TTStatus        @{
    ChildClassName =    'TTState'
    Description =       '状態一覧'
    NeedCache =         'true'
}
Add-TTModelProperty TTState         @{
    TableHeaders = @{
        Value = '設定'
    }
    TableItems = @{
        All =       'Name,Value'
        Library =   'Name,Value'
        Index =     'Name,Value'
        Shelf =     'Name,Value'
        Desk =      'Name,Value'
        System =    'Name,Value'
    }
}
Add-TTModelProperty TTActions       @{
    ChildClassName =    'TTAction'
    Description =       'コマンド一覧'
    NeedCache =         'false'
}
Add-TTModelProperty TTAction        @{
    TableHeaders = @{}
    TableItems = @{
        All =       'Name,ID'
        Library =   'Name,ID'
        Index =     'Name,ID'
        Shelf =     'Name,Value'
        Desk =      'Name,Value'
        System =    'Name,Value'
    }
}
Add-TTModelProperty TTEvents        @{
    ChildClassName =    'TTEvent'
    Description =       'ユーザーイベント一覧'
    NeedCache =         'false'
}
Add-TTModelProperty TTEvent         @{
    TableHeaders = @{
        Tag =       'タグ'
        _mods=      '修飾キー'
        _key =      'キー'
        Name =      'コマンド'
        ID =        'ID'
    }
    TableItems = @{
        All =       'Tag,_mods,_key,Name,ID'
        Library =   'Name,ID'
        Index =     'Name,ID'
        Shelf =     'Tag,_mods,_key,Name,ID'
        Desk =      'Tag,_mods,_key,Name,ID'
        System =    'Tag,_mods,_key,Name,ID'
    }
}
Add-TTModelProperty TTMemos         @{
    ChildClassName =    'TTMemo'
    Description =       'メモ一覧'
    NeedCache =         'true'
}
Add-TTModelProperty TTMemo          @{
    TableHeaders = @{
        ID =            'メモID'
        UpdateDate =    '更新日'
        Name =          'タイトル'
        _flag =         '編'
    }
    TableItems = @{
        All =       '_flag,UpdateDate,ID,Name'
        Library =   '_flag,UpdateDate,ID,Name'
        Index =     'Name,UpdateDate'
        Shelf =     '_flag,UpdateDate,ID,Name'
        Desk =      '_flag,UpdateDate,ID,Name'
        System =    '_flag,UpdateDate,ID,Name'
    }
}
Add-TTModelProperty TTEditings      @{
    ChildClassName =    'TTEditing'
    Description =       '編集状態一覧'
    NeedCache =         'true'
}
Add-TTModelProperty TTEditing       @{
    TableHeaders = @{
        ID =            'メモID'
        UpdateDate =    '更新日'
        CaretPos =      'カーソル位置'
        WordWrap =      'ワードラップ'
        Foldings =      '折畳み'
    }
    TableItems = @{
        All =       '_flag,UpdateDate,Foldings,CaretPos,WordWrap,ID'
        Library =   '_flag,UpdateDate,ID'
        Index =     '_flag,Title'
        Shelf =     '_flag,UpdateDate,ID'
        Desk =      '_flag,UpdateDate,ID'
        System =    '_flag,UpdateDate,ID'
    }
}
Add-TTModelProperty TTWebSearches   @{
    ChildClassName =    'TTWebSearch'
    Description =       'Web検索一覧'
    NeedCache =         'false'
}
Add-TTModelProperty TTWebSearch     @{
    TableHeaders = @{
        ID =        'タグ'
        Name =      '名前'
        Url =       'Url'
    }
    TableItems = @{
        Display =       'ID,Name,Url'
        ShelfOrder =    'ID,Name,Url'
        IndexOrder =    'ID,Name,Url'
        CabinetOrder =  'ID,Name,Url'
    }
}
Add-TTModelProperty TTWebLinks      @{
    ChildClassName =    'TTWebLink'
    Description =       'Webリンク一覧'
    NeedCache =         'false'
}
Add-TTModelProperty TTWebLink       @{
    TableHeaders = @{
        ID =        'タグ'
        Name =      '名前'
        Url =       'Url'
    }
    TableItems = @{
        Display =       'ID,Name,Url'
        ShelfOrder =    'ID,Name,Url'
        IndexOrder =    'ID,Name,Url'
        CabinetOrder =  'ID,Name,Url'
    }
}
