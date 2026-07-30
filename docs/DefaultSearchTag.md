# ID,           Description,                     URL
Google,         "G)検索 > J)Google検索J",                https://www.google.com/search?q={0}
GoogleE,        "G)検索 > E)Google検索E",                http://www.google.co.jp/search?lr=lang_en&q={0}
Bing,           "G)検索 > B)Bing",                         https://www.bing.com/search?q={0}
Yahoo,          "G)検索 > Y)Yahoo!検索",                    https://search.yahoo.co.jp/search?p={0}&fr=top_ga1_sa&ei=UTF-8&ts=1822&aq=-1&oq=&at=&ai=bfeb5a61-4500-491e-a69e-38786e766c4a
Wikipedia,      "G)検索 > W)WikipediaJ",                 https://ja.wikipedia.org/wiki/{0}
WikipediaE,     "G)検索 > Q)WikipediaE",                 https://en.wikipedia.org/wiki/{0}

GoogleJE,       "T)翻訳 > J)Google翻訳JE",               https://translate.google.com/?hl=ja$op=translate&sl=ja&tl=en&text={0}
GoogleEJ,       "T)翻訳 > E)Google翻訳EJ",               https://translate.google.com/?hl=ja$&op=translate&sl=en&tl=ja&text={0}

GoogleMap,      "R)場所 > M)Googleマップ",                 https://google.com/maps/search/{0}

Youtube,        "M)Media > Y)Youtube",                      https://www.youtube.com/results?search_query={0}
Spotify,        "M)Media > S)Spotify",                      https://open.spotify.com/search/{0}

GScholar,       "S)科学 > S)Googleスカラー",               https://scholar.google.co.jp/scholar?q={0}
Pubmed,         "S)科学 > P)Pubmed検索",                   https://pubmed.ncbi.nlm.nih.gov/?term={0}
Wikipedia,      "S)科学 > W)WikipediaJ",                 https://ja.wikipedia.org/wiki/{0}
WikipediaE,     "S)科学 > Q)WikipediaE",                 https://en.wikipedia.org/wiki/{0}

Pubmed,         "D)製薬 > P)Pubmed検索",                   https://pubmed.ncbi.nlm.nih.gov/?term={0}
NIPH,           "D)製薬 > N)国立保健医療科学院",             https://rctportal.niph.go.jp/s/result?t=chiken&q={0}
CTG,            "D)製薬 > C)ClinicalTrials.gov",           https://clinicaltrials.gov/ct2/results?term=&cntry=&state=&city=&dist=&cond={0}
Cortellis,      "D)製薬 > O)コルテリス",                   https://www.cortellis.com/intelligence/qsearch/{0}?indexBased=true&searchCategory=ALL
PMDA,           "D)製薬 > P)医薬品医療機器総合機構",       https://ss.pmda.go.jp/ja_all/search.x?ie=UTF-8&page=1&q={0}
KAKEN,          "D)製薬 > K)日本学術振興会科研費",         https://kaken.nii.ac.jp/ja/search/?kw={0}
EMA,            "D)製薬 > E)欧州医薬品庁",                 https://www.clinicaltrialsregister.eu/ctr-search/search?query={0}
JST,            "D)製薬 > J)科学技術振興機構",             https://www.jstage.jst.go.jp/result/global/-char/ja?globalSearchKey={0}
PMC,            "D)製薬 > M)PubMed Central",               https://www.ncbi.nlm.nih.gov/pmc/?term={0}
MHLW,           "D)製薬 > W)厚生労働省",                   https://www.mhlw.go.jp/search.html?q={0}

NET,            "I)IT > N).NET API Browser",             https://docs.microsoft.com/ja-jp/dotnet/api/?view=net-5.0&term={0}
VBAOutlook,     "I)IT > V)VBAOutlook",                   https://docs.microsoft.com/ja-jp/search/?category=outlook&search={0}

## 以下はWeb検索タグ（WebSearch）ではないActionTagのサブタイプ一覧（メニュー確認用の参照データ）。
## URL列の NoURL は実際のURLテンプレートを持たない（＝WebSearchタグではない）ことを示す印。
Anchor,         "A)ActionTag > A)アンカー移動/設定 ([:name] [:>name])",                 NoURL
GoogleRoute,    "A)ActionTag > R)Google Mapsルート ([GoogleRoute:地点1,地点2,...])",    NoURL
YahooTransfer,  "A)ActionTag > Y)Yahoo!乗換案内 ([YahooTransfer:出発,到着,...])",       NoURL
Think,          "A)ActionTag > T)Think検索/オープン (Think/ThinkTank/Memo)",            NoURL
Mail,           "A)ActionTag > M)メール（未実装）",                                     NoURL
Chat,           "A)ActionTag > C)Chat検索",                                             NoURL
AI,             "A)ActionTag > I)外部AI接続 (AI/Gemini/ChatGPT/Claude/GPT)",            NoURL


