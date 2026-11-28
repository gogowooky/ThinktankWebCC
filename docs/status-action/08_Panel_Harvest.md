# Panel Harvest ====================================================================================================
## Status：　260917　HarvestPanel.Area.OpenWidth
key:の意味はThinktankPanel.Area.OpenWidthと同じ
description:    HarvestパネルOpen時の幅
key:            HarvestPanel.Area.OpenWidth
type:           string
candidates:     (init|user|foredit)
## Status：　260619　HarvestPanel.Area.IsOpen

description:    右パネル表示
key:            HarvestPanel.Area.IsOpen
current:        false
default:        true
type:           boolean
candidates:     ^(true|false)$
## Status：　260613　HarvestPanel.Mode.Name

description:    右パネルモード
key:            HarvestPanel.Mode.Name
current:        Chat
default:        Chat
type:           string
candidates:     ^(Chat|Settings)$

　Q：設定値を記載してください。
　A：設定可能な値は以下の2つです。
　　- Chat （AI対話チャット）
　　- Settings （設定）
