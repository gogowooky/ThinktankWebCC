import { TTApplication } from '../../Views/TTApplication';


interface DateComponents {
    year: number;
    month: number;
    day: number;
    weekday?: string;
    hour?: number;
    minute?: number;
    gengo?: string;
    originalFormat: string; // 'Date' | 'DateTag' | 'JDate' | 'GDate'
    hasTime: boolean;
    hasWeekday: boolean;
}

export class DateHelper {
    public static weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    public static gengoList = [
        { name: '令和', startYear: 2019 },
        { name: '平成', startYear: 1989 },
        { name: '昭和', startYear: 1926 },
        { name: '大正', startYear: 1912 },
        { name: '明治', startYear: 1868 }
    ];

    /**
     * Parse text based on TTRequest ID
     */
    public static parseDate(text: string, requestId: string): { date: Date, components: DateComponents } | null {
        let match: RegExpMatchArray | null = null;
        let year = 0, month = 0, day = 0;
        let hour: number | undefined, minute: number | undefined;
        let weekday: string | undefined;
        let gengo: string | undefined;

        // Clean text (remove brackets for DateTag logic if necessary, though regex handles it)
        // TTRequest patterns from DefaultRequests.ts

        if (requestId === 'DateTag') {
            // \[(\d{4})\-(\d{2})\-(\d{2})\]
            match = text.match(/^\[(?<y>\d{4})\-(?<m>\d{2})\-(?<d>\d{2})\]$/);
            if (match && match.groups) {
                year = parseInt(match.groups.y, 10);
                month = parseInt(match.groups.m, 10);
                day = parseInt(match.groups.d, 10);
                return this.createResult(year, month, day, undefined, undefined, undefined, undefined, 'DateTag', false, false);
            }
        } else if (requestId === 'Date') {
            // (?<y>\d{4})\/(?<m>\d{1,2})\/(?<d>\d{1,2})(\((?<w>[日月火水木金土])\))?( (?<h>\d{2}):(?<n>\d{2}))?
            match = text.match(/^(?<y>\d{4})\/(?<m>\d{1,2})\/(?<d>\d{1,2})(?:\((?<w>[日月火水木金土])\))?(?: (?<h>\d{2}):(?<n>\d{2}))?$/);
            if (match && match.groups) {
                year = parseInt(match.groups.y, 10);
                month = parseInt(match.groups.m, 10);
                day = parseInt(match.groups.d, 10);
                weekday = match.groups.w;
                if (match.groups.h && match.groups.n) {
                    hour = parseInt(match.groups.h, 10);
                    minute = parseInt(match.groups.n, 10);
                }
                return this.createResult(year, month, day, hour, minute, weekday, undefined, 'Date', hour !== undefined, !!weekday);
            }
        } else if (requestId === 'JDate') {
            // (?<y>\d{4})年(?<m>\d{1,2})月(?<d>\d{1,2})日(\((?<w>[日月火水木金土])\))?( (?<h>\d{2}):(?<n>\d{2}))?
            match = text.match(/^(?<y>\d{4})年(?<m>\d{1,2})月(?<d>\d{1,2})日(?:\((?<w>[日月火水木金土])\))?(?: (?<h>\d{2}):(?<n>\d{2}))?$/);
            if (match && match.groups) {
                year = parseInt(match.groups.y, 10);
                month = parseInt(match.groups.m, 10);
                day = parseInt(match.groups.d, 10);
                weekday = match.groups.w;
                if (match.groups.h && match.groups.n) {
                    hour = parseInt(match.groups.h, 10);
                    minute = parseInt(match.groups.n, 10);
                }
                return this.createResult(year, month, day, hour, minute, weekday, undefined, 'JDate', hour !== undefined, !!weekday);
            }
        } else if (requestId === 'GDate') {
            // (?<g>明治|大正|昭和|平成|令和)(?<y>\d{1,2}|元)年(?<m>\d{1,2})月(?<d>\d{1,2})日(\((?<w>[日月火水木金土])\))?( (?<h>\d{2}):(?<n>\\d{2}))?
            match = text.match(/^(?<g>明治|大正|昭和|平成|令和)(?<y>\d{1,2}|元)年(?<m>\d{1,2})月(?<d>\d{1,2})日(?:\((?<w>[日月火水木金土])\))?(?: (?<h>\d{2}):(?<n>\d{2}))?$/);
            if (match && match.groups) {
                gengo = match.groups.g;
                const gYearStr = match.groups.y;
                const gYear = gYearStr === '元' ? 1 : parseInt(gYearStr, 10);
                month = parseInt(match.groups.m, 10);
                day = parseInt(match.groups.d, 10);
                weekday = match.groups.w;
                if (match.groups.h && match.groups.n) {
                    hour = parseInt(match.groups.h, 10);
                    minute = parseInt(match.groups.n, 10);
                }

                // Convert Gengo to AD
                year = this.convertGengoToAD(gengo, gYear);

                return this.createResult(year, month, day, hour, minute, weekday, gengo, 'GDate', hour !== undefined, !!weekday);
            }
        }

        return null;
    }

    private static createResult(
        year: number, month: number, day: number,
        hour: number | undefined, minute: number | undefined,
        weekday: string | undefined, gengo: string | undefined,
        format: string, hasTime: boolean, hasWeekday: boolean
    ): { date: Date, components: DateComponents } {
        const date = new Date(year, month - 1, day, hour || 0, minute || 0);
        return {
            date,
            components: {
                year, month, day, hour, minute, weekday, gengo,
                originalFormat: format,
                hasTime,
                hasWeekday
            }
        };
    }

    private static convertGengoToAD(gengo: string, year: number): number {
        const found = this.gengoList.find(g => g.name === gengo);
        if (found) {
            return found.startYear + year - 1;
        }
        return 1900 + year; // Fallback
    }

    private static convertADToGengo(year: number): { gengo: string, year: number | string } {
        for (const g of this.gengoList) {
            if (year >= g.startYear) {
                const gYear = year - g.startYear + 1;
                return { gengo: g.name, year: gYear === 1 ? '元' : gYear };
            }
        }
        return { gengo: '西暦', year: year };
    }

    /**
     * Shift date
     */
    public static shiftDate(date: Date, amount: number, unit: 'year' | 'month' | 'day' | 'week'): Date {
        const newDate = new Date(date);
        switch (unit) {
            case 'year':
                newDate.setFullYear(newDate.getFullYear() + amount);
                break;
            case 'month':
                newDate.setMonth(newDate.getMonth() + amount);
                break;
            case 'day':
                newDate.setDate(newDate.getDate() + amount);
                break;
            case 'week':
                newDate.setDate(newDate.getDate() + (amount * 7));
                break;
        }
        return newDate;
    }

    /**
     * Format date back to string based on components
     */
    public static formatDate(date: Date, components: DateComponents): string {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        const wIdx = date.getDay(); // 0=Sun
        const wStr = this.weekdays[wIdx];

        const pad = (n: number, width: number = 2) => String(n).padStart(width, '0');

        let timePart = '';
        if (components.hasTime && components.hour !== undefined && components.minute !== undefined) {
            // Keep original time? No request to shift time, so we keep the valid time components if they are on the date object?
            // Actually parsing created a Date object with the time. shiftDate preserves time.
            const h = date.getHours(); // Should match unless changed
            const n = date.getMinutes();
            timePart = ` ${pad(h)}:${pad(n)}`;
        }

        let weekPart = '';
        if (components.hasWeekday) {
            weekPart = `(${wStr})`;
        }

        if (components.originalFormat === 'DateTag') {
            return `[${y}-${pad(m)}-${pad(d)}]`;
        }

        if (components.originalFormat === 'Date') {
            return `${y}/${m}/${d}${weekPart}${timePart}`; // M/D logic: regex allowed 1,2 digits. Let's output without padding if original was simple? 
            // The regex `(?<m>\d{1,2})` allows single digit. 
            // Standardizing to padding or no?
            // "同表示フォーマットのまま" implies keeping padding style ideally, but that's hard to track.
            // Let's assume standard slashed format often uses zero-padding or not. 
            // Start simple: use zero padding for consistency, or standard slash format.
            // Actually `YYYY/MM/DD` usually implies padding. `2024/1/1` is also valid.
            // Let's use padding for slashed to be safe/clean.
            return `${y}/${pad(m)}/${pad(d)}${weekPart}${timePart}`;
        }

        if (components.originalFormat === 'JDate') {
            return `${y}年${pad(m)}月${pad(d)}日${weekPart}${timePart}`;
        }

        if (components.originalFormat === 'GDate') {
            const g = this.convertADToGengo(y);
            // GDate often uses 2 digits for year? Regex said `\d{1,2}|元`.
            // Let's output properly.
            return `${g.gengo}${g.year}年${pad(m)}月${pad(d)}日${weekPart}${timePart}`;
        }

        return date.toISOString(); // Fallback
    }

    /**
     * Execute date shift action on the active editor
     */
    public static performDateShift(context: any, amount: number, unit: 'year' | 'month' | 'day' | 'week') {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;


        if (!panel) return;

        // カーソル位置のリクエストを取得
        const req = panel.GetActiveRequest(context);

        // 有効な日付リクエストかチェック
        if (!req || !['DateTag', 'Date', 'GDate', 'JDate'].includes(req.requestId)) {
            console.warn('[DateTime.Shift] Not on a valid date request.');
            return;
        }

        const text = req.requestTag;
        const parseResult = this.parseDate(text, req.requestId);

        if (!parseResult) {
            console.warn(`[DateTime.Shift] Failed to parse date: ${text} (${req.requestId})`);
            return;
        }

        const newDate = this.shiftDate(parseResult.date, amount, unit);
        const newText = this.formatDate(newDate, parseResult.components);

        if (newText === text) return;

        // エディタの置換
        const editor = panel.Editor.Handle?.getEditor();
        if (editor) {
            const model = editor.getModel();
            const position = editor.getPosition();

            if (model && position) {
                // requestTagそのものを検索
                const matches = model.findMatches(text, false, false, false, null, true);
                const targetMatch = matches.find((m: any) => m.range.containsPosition(position));

                if (targetMatch) {
                    editor.executeEdits('DateTime.Shift', [{
                        range: targetMatch.range,
                        text: newText,
                        forceMoveMarkers: true
                    }]);
                }
            }
        }
    }


    /**
     * Update date details (weekday/time)
     */
    public static performDateDetailUpdate(context: any, target: 'weekday' | 'time', enable: boolean) {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (!panel) return;

        const req = panel.GetActiveRequest(context);
        if (!req || !['Date', 'GDate', 'JDate'].includes(req.requestId)) {
            // DateTag does not support time/weekday in this spec
            console.warn('[DateTime.Detail] Not on a valid date request (DateTag ignored).');
            return;
        }

        const text = req.requestTag;
        const parseResult = this.parseDate(text, req.requestId);

        if (!parseResult) {
            console.warn(`[DateTime.Detail] Failed to parse date: ${text}`);
            return;
        }

        // Update components
        if (target === 'weekday') {
            parseResult.components.hasWeekday = enable;
        } else if (target === 'time') {
            parseResult.components.hasTime = enable;
            // If enabling time and no time present, default to current time or 00:00?
            // Spec says "if time not present, use 00:00 or original".
            // parseDate puts 00:00 if missing.
            if (enable && (parseResult.components.hour === undefined)) {
                parseResult.components.hour = 0;
                parseResult.components.minute = 0;
            }
        }

        const newText = this.formatDate(parseResult.date, parseResult.components);

        if (newText === text) return;

        // Replace in editor
        const editor = panel.Editor.Handle?.getEditor();
        if (editor) {
            const model = editor.getModel();
            const position = editor.getPosition();

            if (model && position) {
                const matches = model.findMatches(text, false, false, false, null, true);
                const targetMatch = matches.find((m: any) => m.range.containsPosition(position));

                if (targetMatch) {
                    editor.executeEdits('DateTime.Detail', [{
                        range: targetMatch.range,
                        text: newText,
                        forceMoveMarkers: true
                    }]);
                }
            }
        }
    }


    /**
     * Change date format
     */
    public static performDateFormatChange(context: any, targetFormat: 'Date' | 'DateTag' | 'JDate' | 'GDate' | 'Next' | 'Prev') {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (!panel) return;

        const req = panel.GetActiveRequest(context);
        if (!req || !['Date', 'DateTag', 'GDate', 'JDate'].includes(req.requestId)) {
            console.warn('[DateTime.ChangeFormat] Not on a valid date request.');
            return;
        }

        const text = req.requestTag;
        const parseResult = this.parseDate(text, req.requestId);

        if (!parseResult) {
            console.warn(`[DateTime.ChangeFormat] Failed to parse date: ${text}`);
            return;
        }

        const formats = ['DateTag', 'Date', 'JDate', 'GDate'];
        let newFormat = targetFormat;

        if (targetFormat === 'Next') {
            const currentIndex = formats.indexOf(parseResult.components.originalFormat);
            const nextIndex = (currentIndex + 1) % formats.length;
            newFormat = formats[nextIndex] as any;
        } else if (targetFormat === 'Prev') {
            const currentIndex = formats.indexOf(parseResult.components.originalFormat);
            const prevIndex = (currentIndex - 1 + formats.length) % formats.length;
            newFormat = formats[prevIndex] as any;
        }

        parseResult.components.originalFormat = newFormat;

        // Special handling for DateTag: remove time/weekday?
        // Spec: DateTag is [YYYY-MM-DD]. formatDate handles it by ignoring them.
        // But if we go back to Date/JDate/GDate, we might want to restore them if they were present?
        // For now, simple format change. DateTag will just not show them.
        // If we switch back from DateTag, information about time/weekday might be lost if it wasn't in the DateTag string.
        // But parseResult comes from the *current* string.
        // If current is DateTag, hasTime/hasWeekday are false.
        // So switching DateTag -> Date will result in YYYY/MM/DD without weekday/time.
        // This is expected behavior unless we store state elsewhere (which we don't).

        const newText = this.formatDate(parseResult.date, parseResult.components);

        if (newText === text) return;

        // Replace in editor
        const editor = panel.Editor.Handle?.getEditor();
        if (editor) {
            const model = editor.getModel();
            const position = editor.getPosition();

            if (model && position) {
                const matches = model.findMatches(text, false, false, false, null, true);
                const targetMatch = matches.find((m: any) => m.range.containsPosition(position));

                if (targetMatch) {
                    editor.executeEdits('DateTime.ChangeFormat', [{
                        range: targetMatch.range,
                        text: newText,
                        forceMoveMarkers: true
                    }]);
                }
            }
        }
    }


    /**
     * Toggle date details (weekday/time)
     */
    private static _sessionTime: { hour: number, minute: number } | null = null;

    /**
     * Reset session time for ExDateTime mode
     */
    public static resetSessionTime(initialDate?: Date) {
        if (initialDate) {
            this._sessionTime = {
                hour: initialDate.getHours(),
                minute: initialDate.getMinutes()
            };
            console.log(`[DateHelper] Reset session time to ${this._sessionTime.hour}:${this._sessionTime.minute}`);
        } else {
            const now = new Date();
            this._sessionTime = {
                hour: now.getHours(),
                minute: now.getMinutes()
            };
            console.log(`[DateHelper] Reset session time to current time: ${this._sessionTime.hour}:${this._sessionTime.minute}`);
        }
    }

    /**
     * Toggle date details (weekday/time)
     */
    public static performDateDetailToggle(context: any, target: 'weekday' | 'time') {
        const app = TTApplication.Instance;
        const panel = app.ExCurrentPanel;
        if (!panel) return;

        const req = panel.GetActiveRequest(context);
        // Include 'DateTag' in supported requests
        if (!req || !['Date', 'GDate', 'JDate', 'DateTag'].includes(req.requestId)) {
            console.warn(`[DateTime.ChangeDetail] Not on a valid date request: ${req?.requestId || 'None'}`);
            return;
        }

        const text = req.requestTag;
        const parseResult = this.parseDate(text, req.requestId);

        if (!parseResult) {
            console.warn(`[DateTime.ChangeDetail] Failed to parse date: ${text}`);
            return;
        }

        // Check if current format supports detailed info
        if (parseResult.components.originalFormat === 'DateTag') {
            // DateTag does not support weekday/time display by default.
            // Automatically switch to 'Date' format to show details.
            parseResult.components.originalFormat = 'Date';
            console.log(`[DateTime.ChangeDetail] Auto-converted DateTag to Date format to support details.`);
        }

        // Toggle components
        if (target === 'weekday') {
            parseResult.components.hasWeekday = !parseResult.components.hasWeekday;
            console.log(`[DateTime.ChangeDetail] Toggled weekday: ${parseResult.components.hasWeekday}`);
        } else if (target === 'time') {
            parseResult.components.hasTime = !parseResult.components.hasTime;

            if (parseResult.components.hasTime) {
                // Enabling time: restore from session time if available
                if (this._sessionTime) {
                    parseResult.components.hour = this._sessionTime.hour;
                    parseResult.components.minute = this._sessionTime.minute;
                    console.log(`[DateTime.ChangeDetail] Restored session time: ${this._sessionTime.hour}:${this._sessionTime.minute}`);
                } else if (parseResult.components.hour === undefined) {
                    // Fallback to current time if no session time (e.g. initial toggle if ExMode entered differently)
                    // Spec says "if time not present, use 00:00 or original". User wants "current time".
                    const now = new Date();
                    parseResult.components.hour = now.getHours();
                    parseResult.components.minute = now.getMinutes();

                    // Also initialize session time for consistency
                    this.resetSessionTime(now);

                    console.log(`[DateTime.ChangeDetail] Session time not found, defaulted to current time: ${parseResult.components.hour}:${parseResult.components.minute}`);
                }

                // IMPORTANT: Update the date object as well, since formatDate uses it for time rendering
                if (parseResult.components.hour !== undefined && parseResult.components.minute !== undefined) {
                    parseResult.date.setHours(parseResult.components.hour);
                    parseResult.date.setMinutes(parseResult.components.minute);
                }
            }
            console.log(`[DateTime.ChangeDetail] Toggled time: ${parseResult.components.hasTime}`);
        }

        const newText = this.formatDate(parseResult.date, parseResult.components);

        if (newText === text) {
            console.log(`[DateTime.ChangeDetail] No changes made (format result is identical).`);
            return;
        }

        // Replace in editor
        const editor = panel.Editor.Handle?.getEditor();
        if (editor) {
            const model = editor.getModel();
            const position = editor.getPosition();

            if (model && position) {
                const matches = model.findMatches(text, false, false, false, null, true);
                const targetMatch = matches.find((m: any) => m.range.containsPosition(position));

                if (targetMatch) {
                    editor.executeEdits('DateTime.ChangeDetail', [{
                        range: targetMatch.range,
                        text: newText,
                        forceMoveMarkers: true
                    }]);
                    console.log(`[DateTime.ChangeDetail] Replaced '${text}' with '${newText}'`);
                } else {
                    console.warn(`[DateTime.ChangeDetail] Failed to find match for '${text}' at cursor position.`);
                }
            }
        }
    }
}
