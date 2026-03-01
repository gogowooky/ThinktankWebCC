import React from 'react';
import { FixedSizeList as List } from 'react-window';
import { TTModels } from '../../models/TTModels';
import { TTObject } from '../../models/TTObject';
import { TTCollection } from '../../models/TTCollection';
import { TTPanel } from '../../Views/TTPanel';
import { TTApplication } from '../../Views/TTApplication';

interface ModelBrowserProps {
    root: TTObject;
    panel?: TTPanel;
}

// Helper functions (defined outside component to avoid re-creation and scope issues)
const parseCSV = (csv: string | undefined): string[] => {
    if (!csv) return [];
    return csv.split(',').map(s => s.trim()).filter(s => s);
};

const parseMapping = (csv: string | undefined): Map<string, string> => {
    const map = new Map<string, string>();
    if (!csv) return map;
    csv.split(',').forEach(pair => {
        const parts = pair.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parts.slice(1).join(':').trim();
            if (key) map.set(key, val);
        }
    });
    return map;
};

const parseMaxWidth = (csv: string | undefined): Map<string, number> => {
    const map = new Map<string, number>();
    if (!csv) return map;
    csv.split(',').forEach(pair => {
        const parts = pair.split(':');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const val = parseInt(parts[1].trim(), 10);
            if (key && !isNaN(val)) map.set(key, val);
        }
    });
    return map;
};

const serializeMaxWidth = (map: Map<string, number>): string => {
    const parts: string[] = [];
    map.forEach((val, key) => {
        parts.push(`${key}:${val}`);
    });
    return parts.join(',');
};

export const ModelBrowser: React.FC<ModelBrowserProps & { filterText?: string }> = ({ root, panel, filterText }) => {
    // 1. All useState / useRef Definitions
    const [items, setItems] = React.useState<TTObject[]>([]);

    // --- Sorting State ---
    const [sortColumn, setSortColumn] = React.useState<string | null>(panel ? panel.Table.SortProperty : null);
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>(panel ? panel.Table.SortDir : 'asc');
    const [fontSize, setFontSize] = React.useState<number>(panel ? panel.FontSize : 12);

    // Derived dimensions
    const rowHeight = Math.ceil(fontSize * 1.5);
    const headerHeight = Math.ceil(fontSize * 1.8);

    // --- Selection State (1ベース、0は無選択) ---
    const [selectedIndex, setSelectedIndex] = React.useState<number>(
        panel ? parseInt(panel.Table.CurPos || '0', 10) : 0
    );
    // 選択されたアイテムのIDを保持（Sort/Filter後の追跡用）
    const [selectedItemId, setSelectedItemId] = React.useState<string>('');

    // コンテナサイズ監視 (State定義を上に移動)
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [containerSize, setContainerSize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // List Ref
    const listRef = React.useRef<List>(null);

    // ヘッダー横スクロール同期用 Ref
    const headerRef = React.useRef<HTMLDivElement>(null);
    const listOuterRef = React.useRef<HTMLDivElement>(null);

    // Subscription Ref
    const subId = React.useRef(`ModelBrowser-${Math.random().toString(36).substr(2, 9)}`).current;

    // --- Column Resize State ---
    const [resizeState, setResizeState] = React.useState<{ column: string; startX: number; startWidth: number } | null>(null);

    // 2. Pure Derived Variables
    // Safe access to collection properties
    const collection = (root instanceof TTCollection) ? root : null;

    const isNarrow = containerSize.width < 400;

    // propsToShow Calculation
    let propsToShow: string[] = [];
    if (collection) {
        propsToShow = (isNarrow && collection.ListPropertiesMin)
            ? parseCSV(collection.ListPropertiesMin)
            : parseCSV(collection.ListProperties || "ID,Name");

        if (propsToShow.length === 0) {
            propsToShow.push('ID');
            propsToShow.push('Name');
        }
    }

    const mapping = collection ? parseMapping(collection.ColumnMapping) : new Map<string, string>();
    const maxWidthMap = collection ? parseMaxWidth(collection.ColumnMaxWidth) : new Map<string, number>();

    // 3. Memoized Calculations
    // フィルタリング・ソート
    const processedItems = React.useMemo(() => {
        let result = items;

        // フィルタ
        if (filterText) {
            const orGroups = filterText.split(',').map(s => s.trim()).filter(s => s !== '');
            if (orGroups.length > 0) {
                result = result.filter(item => {
                    return orGroups.some(group => {
                        const andParts = group.split(/\s+/).filter(s => s !== '');
                        return andParts.every(part => {
                            let isNot = false;
                            let keyword = part;
                            if (keyword.startsWith('-') && keyword.length > 1) {
                                isNot = true;
                                keyword = keyword.substring(1);
                            }
                            const lowerKeyword = keyword.toLowerCase();
                            // propsToShow check depends on variable derived above
                            const found = propsToShow.some(p => {
                                const val = String((item as any)[p] || '');
                                return val.toLowerCase().includes(lowerKeyword);
                            });
                            return isNot ? !found : found;
                        });
                    });
                });
            }
        }

        // ソート
        if (sortColumn) {
            result = [...result].sort((a, b) => {
                const valA = String((a as any)[sortColumn] || '').toLowerCase();
                const valB = String((b as any)[sortColumn] || '').toLowerCase();

                // 完全な数値の場合のみ数値比較を行う
                // parseFloatは "2021-01-01" を 2021 と解釈してしまうため、Number()でチェックする
                // ただし空文字列はNumber()で0になるため除外、スペースのみも除外
                const isNumA = valA.trim() !== '' && !isNaN(Number(valA));
                const isNumB = valB.trim() !== '' && !isNaN(Number(valB));

                let cmp = 0;
                if (isNumA && isNumB) {
                    cmp = Number(valA) - Number(valB);
                } else {
                    cmp = valA.localeCompare(valB);
                }
                return sortDirection === 'asc' ? cmp : -cmp;
            });
        }

        return result;
    }, [items, filterText, sortColumn, sortDirection, propsToShow]);

    // 4. Effects (and Width Calculation)

    // カラム幅の自動計算
    const calculatedWidths = React.useMemo(() => {
        const widths = new Map<string, number>();

        // 文字幅計算ヘルパー (ASCII: 1, その他: 2)
        const getWidth = (str: string) => {
            let width = 0;
            for (let i = 0; i < str.length; i++) {
                // こちらも調整: 半角: 0.85, 全角: 1.5
                width += str.charCodeAt(i) <= 255 ? 0.85 : 1.5;
            }
            return Math.ceil(width);
        };

        propsToShow.forEach(p => {
            // ヘッダー幅
            let maxW = getWidth(mapping.get(p) || p);

            // データ幅 (全行走査)
            for (const item of processedItems) {
                const val = String((item as any)[p] || '');
                const w = getWidth(val);
                if (w > maxW) maxW = w;
                // 安全弁: ColumnMaxWidthが-1（無制限）なら打ち切りなし、正の値ならその値で、未設定なら50
                const cmw = maxWidthMap.get(p);
                const breakLimit = (cmw !== undefined && cmw === -1) ? Number.MAX_SAFE_INTEGER : (cmw !== undefined && cmw > 0) ? cmw : 50;
                if (maxW > breakLimit) { maxW = breakLimit; break; }
            }

            // 余白 (+1文字)
            let finalWidth = maxW + 1;

            // ColumnMaxWidth 設定がある場合は上限として適用（データ幅が小さければそちらを使用）
            if (maxWidthMap.has(p)) {
                const limit = maxWidthMap.get(p)!;
                if (limit > 0) {
                    // ColumnMaxWidthを固定幅として適用（マウスリサイズにも対応）
                    finalWidth = limit;
                } else if (limit === -1) {
                    // -1 の場合は無制限（何もしない -> 計算値そのまま）
                }
            } else {
                // 設定がない場合のデフォルト上限（極端に広がりすぎないように）
                if (finalWidth > 50) finalWidth = 50;
            }

            widths.set(p, finalWidth);
        });
        return widths;
    }, [processedItems, propsToShow, mapping, maxWidthMap]);

    // コンテナサイズ監視
    React.useEffect(() => {
        if (!containerRef.current) return;
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        ro.observe(containerRef.current);
        return () => ro.disconnect();
    }, []);

    // Sync from Panel updates
    React.useEffect(() => {
        if (!panel) return;
        const updateSort = () => {
            if (panel.Table.SortProperty !== sortColumn) setSortColumn(panel.Table.SortProperty);
            if (panel.Table.SortDir !== sortDirection) setSortDirection(panel.Table.SortDir);
            if (panel.FontSize !== fontSize) setFontSize(panel.FontSize);

            // 選択位置の処理（数値またはコマンド）
            const rawVal = panel.Table.CurPos || '0';
            const currentPos = selectedIndex;
            let nextPos = currentPos;

            // 準備
            const maxCount = processedItems.length;
            const numVal = parseInt(rawVal, 10);

            // +N / -N の対応 (Signed number implies relative movement)
            const relativeMatch = rawVal.match(/^([+-])(\d+)$/);
            if (relativeMatch) {
                const delta = parseInt(relativeMatch[1] + relativeMatch[2], 10);
                nextPos = Math.max(1, Math.min(maxCount, currentPos + delta));
            } else if (!isNaN(numVal) && String(numVal) === rawVal) {
                // 純粋な数値が渡された場合（符号なし）は絶対位置
                nextPos = numVal;
            } else {
                // コマンド処理
                if (rawVal === 'next') {
                    nextPos = Math.min(maxCount, currentPos + 1);
                } else if (rawVal === 'prev') {
                    nextPos = Math.max(1, currentPos - 1);
                } else if (rawVal === 'first') {
                    nextPos = 1;
                } else if (rawVal === 'last') {
                    nextPos = maxCount;
                }
            }

            // 位置が有効範囲外なら調整（0は許容）
            if (nextPos > processedItems.length) nextPos = processedItems.length;
            if (nextPos < 0) nextPos = 0;

            // 変更があれば適用
            if (nextPos !== selectedIndex) {
                setSelectedIndex(nextPos);
                // 変更確定後、数値をStatusに書き戻してループを防ぎつつ状態を確定させる
                // (書き戻さないと次回同じ 'next' が来たときに反応しない可能性があるが、
                //  Actionは毎回 ApplyValue を呼ぶので trigger はされる。
                //  ただし Status 値が 'next' のままだと気持ち悪いので数値に戻す)
                if (String(nextPos) !== rawVal) {
                    // この書き戻しが無限ループにならないよう注意（数値同士の変更でなければOK）
                    // 呼び出し元が 'next' -> ここで計算 -> '5' をセット -> 再度ここに来る -> '5'==='5'で終了
                    panel.Table.CurPos = String(nextPos);
                }

                // IDも更新（IndexとIDを同時に更新しないと、Sort/Filter追従用のuseEffectに古いがID優先でIndexを戻されてしまうため）
                if (nextPos > 0 && nextPos <= processedItems.length) {
                    const item = processedItems[nextPos - 1];
                    setSelectedItemId(item.ID);
                    // Scroll to new position
                    if (listRef.current) {
                        listRef.current.scrollToItem(nextPos - 1, "smart");
                    }
                } else if (nextPos === 0) {
                    setSelectedItemId('');
                }
            }
        };
        const subIdPanel = `ModelBrowser-Sort-${Math.random().toString(36).substr(2, 9)}`;
        panel.AddOnUpdate(subIdPanel, updateSort);
        // 初回ロード時も実行
        updateSort();
        return () => panel.RemoveOnUpdate(subIdPanel);
    }, [panel, sortColumn, sortDirection, selectedIndex, processedItems]);

    // Root Subscription
    React.useEffect(() => {
        const update = () => {
            if (root instanceof TTCollection) {
                setItems(root.GetItems());
            }
        };
        root.AddOnUpdate(subId, update);
        update();
        return () => root.RemoveOnUpdate(subId);
    }, [root, subId]);

    // Sort/Filter後に選択アイテムの位置を再計算
    React.useEffect(() => {
        if (!selectedItemId) return;
        const newIndex = processedItems.findIndex(item => item.ID === selectedItemId);
        if (newIndex >= 0) {
            const newPosition = newIndex + 1; // 1ベースに変換
            if (newPosition !== selectedIndex) {
                setSelectedIndex(newPosition);
                if (panel) {
                    panel.Table.CurPos = String(newPosition);
                }
            }
        } else {
            // 表示されていない場合は0にリセット
            if (selectedIndex !== 0) {
                setSelectedIndex(0);
                setSelectedItemId('');
                if (panel) {
                    panel.Table.CurPos = '0';
                    panel.Table.CurrentID = '';
                }
            }
        }
    }, [processedItems, selectedItemId, selectedIndex, panel]);

    // Index変更時にIDを同期（外部からのPosition変更やキーボード移動など）
    React.useEffect(() => {
        if (selectedIndex > 0 && selectedIndex <= processedItems.length) {
            const item = processedItems[selectedIndex - 1]; // 1ベース -> 0ベース
            if (item) {
                // IDの同期（State）
                if (item.ID !== selectedItemId) {
                    setSelectedItemId(item.ID);
                }
                // IDの同期（Panel）
                // selectedItemId更新後でもPanelへの反映が必要な場合があるため、State不一致判定とは分ける
                if (panel && panel.Table.CurrentID !== item.ID) {
                    panel.Table.CurrentID = item.ID;
                }
            }
            // Scroll to selection
            if (selectedIndex > 0 && listRef.current) {
                listRef.current.scrollToItem(selectedIndex - 1, "smart");
            }
        } else if (selectedIndex === 0 && selectedItemId !== '') {
            setSelectedItemId('');
            if (panel) {
                panel.Table.CurrentID = '';
            }
        }
    }, [selectedIndex, processedItems, selectedItemId, panel]);

    // --- Column Resize Logic ---
    const handleResizeStart = (column: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const currentWidth = calculatedWidths.get(column) || 10;
        setResizeState({
            column,
            startX: e.clientX,
            startWidth: currentWidth
        });
    };

    const handleResizeMove = React.useCallback((e: MouseEvent) => {
        if (!resizeState) return;
        // 差分計算 (ピクセル)
        const diffPx = e.clientX - resizeState.startX;
        // ピクセル -> 文字数(ch) への変換
        // フォントサイズにもよるが、おおよそ 1ch ≈ fontSize * 0.6 程度と仮定（monospaceでない場合）
        // 正確には計測が必要だが、簡易的に fontSize * 0.6 で割る
        // fontSize state is available here? No, useCallback dependencies.
        // We can use a rough estimate or ref.
        // Let's rely on standard assumption: 1ch width depends on font, usually around 8-10px for 14px font.
        // Using 0.6 * fontSize (e.g. 12px * 0.6 = 7.2px)
        const charWidthPx = fontSize * 0.6;
        const diffCh = diffPx / charWidthPx;

        const newWidth = Math.max(1, Math.round(resizeState.startWidth + diffCh));

        // 即時反映のためにLocal state更新はできない構造（calculatedWidthsはMemo）なので、
        // コレクションのColumnMaxWidthを直接更新して再レンダリングを促す
        if (collection) {
            const currentMap = parseMaxWidth(collection.ColumnMaxWidth);
            currentMap.set(resizeState.column, newWidth);
            collection.ColumnMaxWidth = serializeMaxWidth(currentMap);
        }
    }, [resizeState, collection, fontSize]);

    const handleResizeEnd = React.useCallback((_e: MouseEvent) => {
        if (!resizeState) return;
        setResizeState(null);
    }, [resizeState]);

    React.useEffect(() => {
        if (resizeState) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
            document.body.style.cursor = 'col-resize';
        } else {
            document.body.style.cursor = '';
        }
        return () => {
            window.removeEventListener('mousemove', handleResizeMove);
            window.removeEventListener('mouseup', handleResizeEnd);
            document.body.style.cursor = '';
        };
    }, [resizeState, handleResizeMove, handleResizeEnd]);


    // 5. Callbacks
    const handleHeaderClick = (column: string) => {
        let newDir: 'asc' | 'desc' = 'asc';
        if (sortColumn === column) {
            newDir = sortDirection === 'asc' ? 'desc' : 'asc';
        }
        setSortColumn(column);
        setSortDirection(newDir);
        if (panel) {
            panel.Table.SortProperty = column;
            panel.Table.SortDir = newDir;
        }
    };

    const handleRowClick = (index: number, itemId: string) => {
        const newPosition = index + 1; // 0ベースから1ベースに変換
        setSelectedIndex(newPosition);
        setSelectedItemId(itemId);
        if (panel) {
            panel.Table.CurPos = String(newPosition);
            panel.Table.CurrentID = itemId;
        }
    };

    const handleRowMouseDown = (e: React.MouseEvent, index: number, itemId: string) => {
        // クリックされた行が既に選択されているか確認（state更新前）
        const clickedRowIndex = index + 1;
        const isAlreadySelected = selectedIndex === clickedRowIndex;

        // 1. Selection update (allows immediate feedback)
        handleRowClick(index, itemId);

        // 2. Build Event Context
        let key = '';
        const detail = e.detail; // 1, 2, 3...

        // e.button: 0:Left, 1:Middle, 2:Right
        if (e.button === 0) {
            key = `LEFT${detail}`;
            if (isAlreadySelected) {
                key = `Selection_${key}`;
            }
        } else if (e.button === 1) {
            key = `MIDDLE${detail}`;
        } else if (e.button === 2) {
            key = `RIGHT${detail}`;
        } else {
            return;
        }

        const mods: string[] = [];
        if (e.ctrlKey) mods.push('Control');
        if (e.shiftKey) mods.push('Shift');
        if (e.altKey) mods.push('Alt');
        if (e.metaKey) mods.push('Meta');

        const context = {   // ega> Tableのマウスイベント
            Key: key,
            Mods: mods,
            ScreenX: e.screenX,
            ScreenY: e.screenY,
            ClientX: e.clientX,
            ClientY: e.clientY
        };

        // 3. Process Event
        const app = TTApplication.Instance;
        const handled = app.UIRequestTriggeredAction(context);

        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    // 仮想リストの行レンダラー
    const Row = React.useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
        const item = processedItems[index];
        const isSelected = selectedIndex === index + 1; // 1ベースで比較
        // 全カラム合計幅を計算（横スクロール対応）
        let rowTotalWidth = 0;
        propsToShow.forEach(p => { rowTotalWidth += (calculatedWidths.get(p) || 10); });
        return (
            <div
                style={{
                    ...style,
                    display: 'flex',
                    minWidth: `${rowTotalWidth}ch`,
                    background: isSelected
                        ? 'var(--tt-list-item-selected)'
                        : (index % 2 === 0 ? 'var(--tt-list-item-bg)' : 'var(--tt-list-item-bg-alt)'),
                    cursor: 'pointer'
                }}
                data-item-id={item.ID}
                onMouseDown={(e) => handleRowMouseDown(e, index, item.ID)}
            >
                {propsToShow.map(p => (
                    <div
                        key={`${item.ID}-${p}`}
                        style={{
                            flex: `0 0 ${calculatedWidths.get(p) || 10}ch`,
                            padding: '0px 4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: 'var(--tt-editor-fg)',
                            lineHeight: `${rowHeight}px`,
                            borderRight: '1px solid transparent'
                        }}
                    >
                        {String((item as any)[p] || '')}
                    </div>
                ))}
            </div>
        );
    }, [processedItems, propsToShow, calculatedWidths, selectedIndex, handleRowClick, rowHeight]);


    // 全カラム合計幅（横スクロール用）
    const totalColumnsWidth = React.useMemo(() => {
        let total = 0;
        propsToShow.forEach(p => {
            total += (calculatedWidths.get(p) || 10);
        });
        // ch単位で計算されるため、パディング分も考慮
        return total;
    }, [propsToShow, calculatedWidths]);

    // 横スクロール同期 Effect
    React.useEffect(() => {
        const outer = listOuterRef.current;
        if (!outer) return;

        const handleScroll = () => {
            if (headerRef.current) {
                headerRef.current.scrollLeft = outer.scrollLeft;
            }
        };

        outer.addEventListener('scroll', handleScroll);
        return () => outer.removeEventListener('scroll', handleScroll);
    }, [processedItems]); // List再生成時にも再バインド

    // 5. Effects (Status Sync)
    const propsToShowStr = propsToShow.join(',');
    React.useEffect(() => {
        if (panel && propsToShowStr) {
            // 少し遅延させて確実にStatusインスタンスがある状態で実行
            const timer = setTimeout(() => {
                const models = TTModels.Instance;
                if (models && models.Status) {
                    const status = models.Status;
                    const id = `${panel.Name}.Table.VisibleProperties`;
                    const currentVal = status.GetValue(id);
                    if (currentVal !== propsToShowStr) {
                        status.ApplyValue(id, propsToShowStr);
                    }
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [panel, propsToShowStr]);

    // 6. Render Logic
    if (!collection) {
        return <div style={{ padding: '8px' }}>Not a collection: {root.Name}</div>;
    }

    const listHeight = containerSize.height - headerHeight;

    return (
        <div className="model-browser" ref={containerRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0', fontSize: `${fontSize}px` }}>
            {/* タイトル削除済み */}

            {/* ヘッダー（横スクロール同期） */}
            <div
                ref={headerRef}
                style={{
                    flex: '0 0 auto',
                    height: headerHeight,
                    overflow: 'hidden', // スクロールバーは非表示、JSで同期
                    background: 'var(--tt-column-header-bg)'
                }}
            >
                <div style={{ display: 'flex', minWidth: `${totalColumnsWidth}ch` }}>
                    {propsToShow.map((p) => (
                        <div
                            key={p}
                            style={{
                                flex: `0 0 ${calculatedWidths.get(p) || 10}ch`,
                                padding: '0px 4px',
                                borderBottom: '1px solid var(--tt-border-color)',
                                fontWeight: 'normal',
                                color: 'var(--tt-column-header-fg)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                userSelect: 'none',
                                lineHeight: `${headerHeight}px`,
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                            title="Click to sort"
                        >
                            {/* Cell Content (Sort Click Area) */}
                            <div
                                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                onClick={() => handleHeaderClick(p)}
                            >
                                {sortColumn === p && (
                                    <span style={{ marginRight: '4px', color: '#fff' }}>
                                        {sortDirection === 'asc' ? '↓' : '↑'}
                                    </span>
                                )}
                                {mapping.get(p) || p}
                            </div>

                            {/* Resize Handle */}
                            <div
                                style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: '4px',
                                    cursor: 'col-resize',
                                    zIndex: 1
                                }}
                                onMouseDown={(e) => handleResizeStart(p, e)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {/* 仮想スクロールリスト */}
            <div style={{ flex: '1 1 auto' }}>
                {listHeight > 0 && containerSize.width > 0 && (
                    <List
                        ref={listRef}
                        outerRef={listOuterRef}
                        height={listHeight}
                        itemCount={processedItems.length}
                        itemSize={rowHeight}
                        width={containerSize.width}
                        style={{ overflowX: 'auto' }}
                    >
                        {Row}
                    </List>
                )}
            </div>
        </div>
    );
};
