import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json({ limit: '10mb' }));

// 静的ファイルの提供（distディレクトリから）
app.use(express.static(path.join(__dirname, 'dist')));

// ローカルキャッシュディレクトリの確保
const cacheDir = path.resolve(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) {
    try {
        fs.mkdirSync(cacheDir, { recursive: true });
    } catch (e) {
        console.error('Failed to create cache directory:', e);
    }
}

// Google Drive API セットアップ
const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

/**
 * Google Driveのフォルダを検索し、存在しなければ作成する
 * @param {string} name フォルダ名
 * @param {string | null} parentId 親フォルダのID（nullの場合はルート）
 * @returns {Promise<string>} フォルダID
 */
async function ensureDriveFolder(name, parentId = null) {
    const qParts = [
        `mimeType='application/vnd.google-apps.folder'`,
        `name='${name}'`,
        `trashed=false`
    ];
    if (parentId) {
        qParts.push(`'${parentId}' in parents`);
    } else {
        qParts.push(`'root' in parents`);
    }

    try {
        const res = await drive.files.list({
            q: qParts.join(' and '),
            fields: 'files(id, name)',
            spaces: 'drive',
        });

        if (res.data.files && res.data.files.length > 0) {
            return res.data.files[0].id;
        }

        // 存在しない場合は作成
        const fileMetadata = {
            name: name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : ['root'],
        };
        const file = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id',
        });
        console.log(`Created Drive folder: ${name} (${file.data.id})`);
        return file.data.id;
    } catch (error) {
        console.error(`Failed to ensure folder '${name}':`, error.message);
        throw error;
    }
}

/**
 * Thinktank/Memo/cache ディレクトリのIDを取得（必要に応じて作成）
 * @returns {Promise<string>} cacheディレクトリのID
 */
async function getDriveCacheDirId() {
    const thinktankId = await ensureDriveFolder('Thinktank', null);
    const memoId = await ensureDriveFolder('Memo', thinktankId);
    const cacheId = await ensureDriveFolder('cache', memoId);
    return cacheId;
}

/**
 * ThinktankフォルダのIDを取得（必要に応じて作成）
 * @returns {Promise<string>} ThinktankディレクトリのID
 */
async function getThinktankFolderId() {
    return await ensureDriveFolder('Thinktank', null);
}

/**
 * Google Driveにファイルを保存（存在する場合は上書き）
 * @param {string} filename ファイル名
 * @param {string} content ファイル内容
 * @param {string} parentId 親フォルダのID
 * @param {string} mimeType MIMEタイプ
 */
async function saveToDrive(filename, content, parentId, mimeType = 'text/plain') {
    try {
        // 既存ファイルの検索
        const q = [
            `name='${filename}'`,
            `'${parentId}' in parents`,
            `trashed=false`
        ];

        const listRes = await drive.files.list({
            q: q.join(' and '),
            fields: 'files(id)',
        });

        const fileId = listRes.data.files && listRes.data.files.length > 0
            ? listRes.data.files[0].id
            : null;

        const { Readable } = await import('stream');
        const stream = Readable.from([content]);

        if (fileId) {
            // 既存ファイルを更新
            await drive.files.update({
                fileId: fileId,
                media: {
                    mimeType: mimeType,
                    body: stream,
                },
            });
            console.log(`Updated Drive file: ${filename} (${fileId})`);
        } else {
            // 新規作成
            await drive.files.create({
                requestBody: {
                    name: filename,
                    parents: [parentId],
                },
                media: {
                    mimeType: mimeType,
                    body: stream,
                },
            });
            console.log(`Created Drive file: ${filename}`);
        }
    } catch (error) {
        console.error(`Failed to save to Drive (${filename}):`, error.message);
        throw error;
    }
}

/**
 * Google Driveからファイルを読み込む
 * @param {string} filename ファイル名
 * @param {string} parentId 親フォルダのID
 * @returns {Promise<string | null>} ファイル内容（見つからない場合はnull）
 */
async function readFromDrive(filename, parentId) {
    try {
        const q = [
            `name='${filename}'`,
            `'${parentId}' in parents`,
            `trashed=false`
        ];

        const listRes = await drive.files.list({
            q: q.join(' and '),
            fields: 'files(id)',
        });

        if (!listRes.data.files || listRes.data.files.length === 0) {
            return null;
        }

        const fileId = listRes.data.files[0].id;
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media',
        }, { responseType: 'text' });

        return response.data;
    } catch (error) {
        console.error(`Failed to read from Drive (${filename}):`, error.message);
        return null;
    }
}

/**
 * Google Driveのファイル一覧を取得
 * @param {string} parentId 親フォルダのID
 * @returns {Promise<Array<{name: string, id: string}>>}
 */
async function listDriveFiles(parentId) {
    try {
        const res = await drive.files.list({
            q: `'${parentId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType)',
            spaces: 'drive',
        });
        return res.data.files || [];
    } catch (error) {
        console.error('Failed to list Drive files:', error.message);
        return [];
    }
}


// API Routes

// POST /api/save（ローカル＋Google Drive）
app.post('/api/save', async (req, res) => {
    try {
        const { filename, content } = req.body;
        if (!filename || content === undefined) {
            return res.status(400).json({ error: 'Filename and content are required' });
        }

        // 1. ローカルキャッシュに保存
        const filePath = path.join(cacheDir, filename);
        if (!filePath.startsWith(cacheDir)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }
        fs.writeFileSync(filePath, content, 'utf-8');

        // 2. Google Driveにも保存（ベストエフォート）
        try {
            const cacheId = await getDriveCacheDirId();
            await saveToDrive(filename, content, cacheId, 'text/csv');
        } catch (driveError) {
            console.warn('Google Drive save failed, but local save succeeded.');
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Save failed:', error);
        res.status(500).json({ error: 'Save failed' });
    }
});

// GET /api/load（ローカルキャッシュから読み込み）
app.get('/api/load', (req, res) => {
    try {
        const filename = req.query.filename;
        if (!filename) {
            return res.status(400).json({ error: 'Filename is required' });
        }

        const filePath = path.join(cacheDir, filename);
        if (!filePath.startsWith(cacheDir)) {
            return res.status(403).json({ error: 'Invalid file path' });
        }

        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            res.json({ content });
        } else {
            res.json({ content: null });
        }
    } catch (error) {
        console.error('Load failed:', error);
        res.status(500).json({ error: 'Load failed' });
    }
});

// GET /api/drive/read（Google Driveから読み込み）
app.get('/api/drive/read', async (req, res) => {
    try {
        const relativePath = req.query.path;
        if (!relativePath) {
            return res.status(400).json({ error: 'Path required' });
        }

        // パスを解析（例: "thinktank.md" または "Memo/filename.md"）
        const parts = relativePath.split('/');
        const filename = parts.pop();

        // Thinktankフォルダから開始
        let parentId = await getThinktankFolderId();

        // サブフォルダがあれば順に辿る
        for (const folderName of parts) {
            const q = [
                `mimeType='application/vnd.google-apps.folder'`,
                `name='${folderName}'`,
                `'${parentId}' in parents`,
                `trashed=false`
            ];
            const listRes = await drive.files.list({
                q: q.join(' and '),
                fields: 'files(id)',
            });

            if (!listRes.data.files || listRes.data.files.length === 0) {
                return res.status(404).json({ error: `Folder not found: ${folderName}` });
            }
            parentId = listRes.data.files[0].id;
        }

        const content = await readFromDrive(filename, parentId);
        if (content !== null) {
            res.json({ content });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (e) {
        console.error('Drive read failed:', e.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/drive/write（Google Driveに書き込み）
app.post('/api/drive/write', async (req, res) => {
    try {
        const { path: relativePath, content } = req.body;
        if (!relativePath || content === undefined) {
            return res.status(400).json({ error: 'Path and content are required' });
        }

        // パスを解析
        const parts = relativePath.split('/');
        const filename = parts.pop();

        // Thinktankフォルダから開始
        let parentId = await getThinktankFolderId();

        // サブフォルダがあれば順に辿る（必要に応じて作成）
        for (const folderName of parts) {
            parentId = await ensureDriveFolder(folderName, parentId);
        }

        await saveToDrive(filename, content, parentId, 'text/markdown');
        res.json({ success: true });
    } catch (e) {
        console.error('Drive write failed:', e.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// GET /api/drive/scan（Google Driveのファイル一覧を取得）
app.get('/api/drive/scan', async (req, res) => {
    try {
        const files = [];
        const thinktankId = await getThinktankFolderId();

        // Thinktankフォルダ直下のファイルを取得
        const rootFiles = await listDriveFiles(thinktankId);
        for (const f of rootFiles) {
            if (f.name.endsWith('.md')) {
                files.push(f.name);
            }
        }

        // Memoフォルダがあればその中のファイルも取得
        const memoFolder = rootFiles.find(f => f.name === 'Memo' && f.mimeType === 'application/vnd.google-apps.folder');
        if (memoFolder) {
            const memoFiles = await listDriveFiles(memoFolder.id);
            for (const f of memoFiles) {
                if (f.name.endsWith('.md')) {
                    files.push(`Memo/${f.name}`);
                }
            }
        }

        res.json({ files });
    } catch (e) {
        console.error('Drive scan failed:', e.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// SPA Fallback
app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Google Drive API mode enabled');
});
