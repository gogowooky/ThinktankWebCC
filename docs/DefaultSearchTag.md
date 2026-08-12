
# ID,           Description,                        URL

## WebSearch
Google,         "Q)検索 > J)Google検索J",           https://www.google.com/search?q={0}
GoogleE,        "Q)検索 > E)Google検索E",           http://www.google.co.jp/search?lr=lang_en&q={0}
Bing,           "Q)検索 > B)Bing",                  https://www.bing.com/search?q={0}
Yahoo,          "Q)検索 > Y)Yahoo!検索",            https://search.yahoo.co.jp/search?p={0}&fr=top_ga1_sa&ei=UTF-8&ts=1822&aq=-1&oq=&at=&ai=bfeb5a61-4500-491e-a69e-38786e766c4a
Wikipedia,      "Q)検索 > W)WikipediaJ",            https://ja.wikipedia.org/wiki/{0}
WikipediaE,     "Q)検索 > Q)WikipediaE",            https://en.wikipedia.org/wiki/{0}

GoogleJE,       "D)辞書 > J)Google翻訳JE",          https://translate.google.com/?hl=ja$op=translate&sl=ja&tl=en&text={0}
GoogleEJ,       "D)辞書 > E)Google翻訳EJ",          https://translate.google.com/?hl=ja$&op=translate&sl=en&tl=ja&text={0}

GoogleMap,      "G)場所 > M)Googleマップ",          https://google.com/maps/search/{0}

Youtube,        "M)Media > Y)Youtube",              https://www.youtube.com/results?search_query={0}
Spotify,        "M)Media > S)Spotify",              https://open.spotify.com/search/{0}

GScholar,       "S)科学 > S)Googleスカラー",            https://scholar.google.co.jp/scholar?q={0}
Pubmed,         "S)科学 > P)Pubmed検索",                https://pubmed.ncbi.nlm.nih.gov/?term={0}
Wikipedia,      "S)科学 > W)WikipediaJ",                https://ja.wikipedia.org/wiki/{0}
WikipediaE,     "S)科学 > Q)WikipediaE",                https://en.wikipedia.org/wiki/{0}

Pubmed,         "P)製薬 > P)Pubmed検索",                https://pubmed.ncbi.nlm.nih.gov/?term={0}
NIPH,           "P)製薬 > N)国立保健医療科学院",        https://rctportal.niph.go.jp/s/result?t=chiken&q={0}
CTG,            "P)製薬 > C)ClinicalTrials.gov",        https://clinicaltrials.gov/ct2/results?term=&cntry=&state=&city=&dist=&cond={0}
Cortellis,      "P)製薬 > O)コルテリス",                https://www.cortellis.com/intelligence/qsearch/{0}?indexBased=true&searchCategory=ALL
PMDA,           "P)製薬 > P)医薬品医療機器総合機構",    https://ss.pmda.go.jp/ja_all/search.x?ie=UTF-8&page=1&q={0}
KAKEN,          "P)製薬 > K)日本学術振興会科研費",      https://kaken.nii.ac.jp/ja/search/?kw={0}
EMA,            "P)製薬 > E)欧州医薬品庁",              https://www.clinicaltrialsregister.eu/ctr-search/search?query={0}
JST,            "P)製薬 > J)科学技術振興機構",          https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey={0}
PMC,            "P)製薬 > M)PubMed Central",            https://www.ncbi.nlm.nih.gov/pmc/?term={0}
MHLW,           "P)製薬 > W)厚生労働省",                https://www.mhlw.go.jp/search.html?q={0}

NET,            "I)IT > N).NET API Browser",            https://docs.microsoft.com/ja-jp/dotnet/api/?view=net-5.0&term={0}
VBAOutlook,     "I)IT > V)VBAOutlook",                  https://docs.microsoft.com/ja-jp/search/?category=outlook&search={0}

## Tag.GoogleRoute:     GoogleMapでplace1,2,3...を通るルートを表示するためのタグ        例：[GOOGLEROUTE:plasce1,place2,place3...]
GoogleRoute,    "G)場所 > R)Googleルート",      NoURL

## Tag.YahooTransfer:   Yahoo乗換案内で電車を検索するためのタグ                         例：[YAHOOTRANSFER:from 東京駅,to 大阪駅,via 名古屋駅,dep 10:00]
##                      パラメータは "key value" 形式のCSV（key: from/to/dep/arr/via、viaは省略可、dep/arrはhh:mm形式）
YahooTransfer,  "G)場所 > Y)Yahoo乗換案内",     NoURL

## Tag.Anchor           8.1 ファイル内で[:anchor]で始まる行に飛ぶためのタグ             例：[:>anchor]
Jump,           "T)Tag > J)Jump",               NoURL

##                      8.2 anchorテキストをHighlighterとして設定するためのタグ         例：[:anchor]
Reference,      "T)Tag > R)参照先",             NoURL

## Tag.Think:           4.1 特定thinkファイルを指定するためのタグ                       例：[THINK:id] [MEMO:id](前方互換用)
ThinkID,        "T)Tag > I)QueryID",            NoURL

##                      4.2 Thinktank>Think一覧のタイトル絞込でkeywordsを検索するタグ   例：[THINK:keywords] [MEMO:keywords](前方互換用)
ThinkTitle,     "T)Tag > T)QueryTitle",         NoURL

##                      4.3 Thinktank>Think一覧のコンテンツ絞込でkeywordsを検索するタグ 例：[THINK:>keywords] [MEMO:>keyword](前方互換用)
ThinkContents,  "T)Tag > K)QueryContent",       NoURL

## Tag.Chat             6.1 Thinktank>Think一覧でタイトル絞込みでkeywords検索するタグ(chatフィルター付)   例：[CHAT:keywords]
ChatTitle,      "T)Tag > C)ChatTitle検索",      NoURL

## Tag.Chat             6.2 Thinktank>Think一覧のコンテンツ絞込みでkeywords検索するタグ(chatフィルター付)   例：[CHAT:>keywords]
ChatContents,   "T)Tag > H)ChatContent検索",    NoURL

## Tag.AI              外部AI(ai:GEMINI,CLAUDE,CHATGTP)へ接続し、sentenceで問い合わせるためのタグ        例：[ai:>] sentence
AI,             "T)Tag > A)外部AI",             NoURL


## Tag.Mail             5.1 特定mailを指定するタグ                                      例：[MAIL:ID]（アクション未実装）
##                      5.2 mail検索をするためのタグ                                    例：[MAIL:keywords]（アクション未実装）
## Mail,           "A)ActionTag > M)メール（未実装）",                                     NoURL




