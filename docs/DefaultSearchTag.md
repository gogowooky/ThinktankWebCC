
# ID,           Description,                        URL

## WebSearch
Google,         Google日,           https://www.google.com/search?q={0}
GoogleE,        Google英,           http://www.google.co.jp/search?lr=lang_en&q={0}
Bing,           Bing,                  https://www.bing.com/search?q={0}
Yahoo,          Yahoo!,            https://search.yahoo.co.jp/search?p={0}&fr=top_ga1_sa&ei=UTF-8&ts=1822&aq=-1&oq=&at=&ai=bfeb5a61-4500-491e-a69e-38786e766c4a
Wikipedia,      Wikipedia日,            https://ja.wikipedia.org/wiki/{0}
WikipediaE,     Wikipedia英,            https://en.wikipedia.org/wiki/{0}

GoogleJE,       Google日英翻訳,          https://translate.google.com/?hl=ja$op=translate&sl=ja&tl=en&text={0}
GoogleEJ,       Google英日翻訳,          https://translate.google.com/?hl=ja$&op=translate&sl=en&tl=ja&text={0}

GoogleMap,      Googleマップ,          https://google.com/maps/search/{0}

Youtube,        Youtube,              https://www.youtube.com/results?search_query={0}
Spotify,        Spotify,              https://open.spotify.com/search/{0}

GScholar,       Googleスカラー,            https://scholar.google.co.jp/scholar?q={0}
Pubmed,         Pubmed,                https://pubmed.ncbi.nlm.nih.gov/?term={0}

NIPH,           国立保健医療科学院,        https://rctportal.niph.go.jp/s/result?t=chiken&q={0}
CTG,            ClinicalTrials.gov,        https://clinicaltrials.gov/ct2/results?term=&cntry=&state=&city=&dist=&cond={0}
Cortellis,      コルテリス,                https://www.cortellis.com/intelligence/qsearch/{0}?indexBased=true&searchCategory=ALL
PMDA,           医薬品医療機器総合機構,    https://ss.pmda.go.jp/ja_all/search.x?ie=UTF-8&page=1&q={0}
KAKEN,          日本学術振興会科研費,      https://kaken.nii.ac.jp/ja/search/?kw={0}
EMA,            欧州医薬品庁,              https://www.clinicaltrialsregister.eu/ctr-search/search?query={0}
JST,            科学技術振興機構,          https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey={0}
PMC,            PubMed Centrla",            https://www.ncbi.nlm.nih.gov/pmc/?term={0}
MHLW,           厚生労働省,                https://www.mhlw.go.jp/search.html?q={0}

## Tag
GoogleRoute,    Googleルート,       NoURL
YahooTransfer,  Yahoo乗換案内,      NoURL
Jump,           文書内ジャンプ,     NoURL
Reference,      文書内参照先,       NoURL
ThinkID,        ThinkファイルID,    NoURL
ThinkTitle,     Thinkタイトル検索,  NoURL
ThinkContents,  Think全文検索,      NoURL
ChatTitle,      Chatタイトル検索,   NoURL
ChatContents,   Chat全文検索,       NoURL


; Tag.GoogleRoute:     GoogleMapでplace1,2,3...を通るルートを表示するためのタグ        例：[GOOGLEROUTE:place1,place2,place3...]
; Tag.YahooTransfer:   Yahoo乗換案内で電車を検索するためのタグ                         例：[YAHOOTRANSFER:from 東京駅,to 大阪駅,via 名古屋駅,dep 10:00]
;                      パラメータは "key value" 形式のCSV（key: from/to/dep/arr/via、viaは省略可、dep/arrはhh:mm形式）
; Tag.Anchor           8.1 ファイル内で[:anchor]で始まる行に飛ぶためのタグ             例：[:>anchor]
; Tag.Reference　      8.2 anchorテキストをHighlighterとして設定するためのタグ         例：[:anchor]
; Tag.Think:           4.1 特定thinkファイルを指定するためのタグ                       例：[THINK:id] [MEMO:id](前方互換用) 
; Tag.ThinkTitle       4.2 Thinktank>Think一覧のタイトル絞込でkeywordsを検索するタグ   例：[THINK:keywords] [MEMO:keywords](前方互換用)
; Tag.ThinkContents    4.3 Thinktank>Think一覧のコンテンツ絞込でkeywordsを検索するタグ 例：[THINK:>keywords] [MEMO:>keyword](前方互換用)
; Tag.Link            linkファイル（1件のURL/パス）を参照するタグ。タグ名はリンク先で決まる        例：[link:id] [gmail:id] [gdrive:id] [gphoto:id] [gnb:id] [path:id]
;                      値が ThinkID のときだけ Link タグとして扱う（docs/261030/linkファイル仕様.md）
; Tag.AIView          Projectの # AIまとめ に並ぶ、Thinkを開くタグ                     例：[aiview:id]
;                      Projectの # AI議論 に並ぶ [chat:id] も、値が ThinkID ならそのchatを開く（docs/261030/projectファイル仕様.md）
; Tag.ChatTitle        6.1 Thinktank>Think一覧でタイトル絞込みでkeywords検索するタグ(chatフィルター付)   例：[CHAT:keywords]
; Tag.ChatContents     6.2 Thinktank>Think一覧のコンテンツ絞込みでkeywords検索するタグ(chatフィルター付)   例：[CHAT:>keywords]

; Tag.Mail             5.1 特定mailを指定するタグ                                      例：[MAIL:ID]（アクション未実装）
;                      5.2 mail検索をするためのタグ                                    例：[MAIL:keywords]（アクション未実装）
; Mail,           "A)ActionTag > M)メール（未実装）",                                     NoURL




