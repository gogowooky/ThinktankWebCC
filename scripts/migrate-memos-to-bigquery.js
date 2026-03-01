/**
 * migrate-memos-to-bigquery.js
 * メモファイルをBigQueryへ移行するスクリプト
 * 
 * 引数で指定されたバックアップディレクトリ内のファイルをBigQueryへアップロードします。
 * ディレクトリ構成:
 *   <BackupDir>/Memo/*.md -> category: 'Memo'
 *   <BackupDir>/Cache/*.md -> category: 'Cache'
 * 
 * 使用方法:
 * set GOOGLE_SERVICE_ACCOUNT_KEY=<サービスアカウントキーの内容>
 * node scripts/migrate-memos-to-bigquery.js <バックアップディレクトリのパス>
 */

import fs from 'fs';
import path from 'path';
import { BigQuery } from '@google-cloud/bigquery';
import chardet from 'chardet';
import iconv from 'iconv-lite';
import { DATASET_ID, TABLE_ID, getCredentials } from './config.js';

/**
 * ファイルを読み込み、UTF-8に変換
 * BOM付きUTF-8、UTF-16 LE、Shift_JIS等を自動検出
 */
function readFileAsUtf8(filePath) {
    const buffer = fs.readFileSync(filePath);

    // BOMをチェック
    let encoding = 'utf8';
    let startOffset = 0;

    // UTF-8 BOM (EF BB BF)
    if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        encoding = 'utf8';
        startOffset = 3;
    }
    // UTF-16 LE BOM (FF FE)
    else if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
        encoding = 'utf16le';
        startOffset = 2;
    }
    // UTF-16 BE BOM (FE FF)
    else if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
        encoding = 'utf16be';
        startOffset = 2;
    }
    else {
        // BOMがない場合は自動検出
        const detected = chardet.detect(buffer);
        if (detected) {
            encoding = detected.toLowerCase();
            // chardetの結果を iconv-lite の形式に変換
            if (encoding === 'utf-16le') encoding = 'utf16le';
            if (encoding === 'utf-16be') encoding = 'utf16be';
            if (encoding === 'shift_jis' || encoding === 'shiftjis') encoding = 'shiftjis';
        }
    }

    // BOMをスキップしてデコード
    const contentBuffer = startOffset > 0 ? buffer.slice(startOffset) : buffer;
    const content = iconv.decode(contentBuffer, encoding);

    return { content, encoding };
}

/**
 * ファイル名からcreated_atを解析
 * 形式: yyyy-MM-dd-HHmmss.md
 */
function parseCreatedAtFromFilename(filename) {
    const match = filename.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.md$/);
    if (match) {
        const [, year, month, day, hour, min, sec] = match;
        return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}+09:00`);
    }
    // 日付解析できない場合は現在時刻ではなくファイルのタイムスタンプを使う方針に変更も可能だが
    // 既存ロジックに合わせてwarnを出す
    // console.warn(`  警告: ファイル名から日付を解析できません: ${filename}`);
    return null;
}

/**
 * コンテンツの1行目からタイトルを抽出
 */
function extractTitle(content) {
    let firstLine = content.split('\n')[0].trim();

    // '===' が含まれている場合は、その手前までをタイトルとする
    const separatorIndex = firstLine.indexOf('===');
    if (separatorIndex !== -1) {
        firstLine = firstLine.substring(0, separatorIndex).trim();
    }

    // Markdownヘッダー記号を削除
    return firstLine.replace(/^#+\s*/, '') || 'Untitled';
}

/**
 * ファイルの作成日時を取得（ファイル属性から）
 */
function getFileCreationDate(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.birthtime || stats.mtime;
    } catch {
        return new Date();
    }
}

/**
 * ディレクトリをスキャンしてレコードを生成
 */
function scanDirectory(dirPath, category, records) {
    if (!fs.existsSync(dirPath)) {
        console.log(`  スキップ: ディレクトリが存在しません: ${dirPath}`);
        return;
    }

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
    console.log(`  ${category}: ${files.length}件のファイルが見つかりました`);

    for (const file of files) {
        const filePath = path.join(dirPath, file);
        const { content, encoding } = readFileAsUtf8(filePath); // 各ファイルでエンコーディング判定
        const fileId = file.replace('.md', '');
        const title = extractTitle(content);

        // created_at決定ロジック
        // 1. ファイル名から日時解析
        // 2. 失敗したらファイルのタイムスタンプ
        let createdAt = parseCreatedAtFromFilename(file);
        if (!createdAt) {
            createdAt = getFileCreationDate(filePath);
        }

        records.push({
            file_id: fileId,
            title,
            file_type: 'md', // 全てmdとして扱う（バックアップ仕様に準拠）
            category: category,
            content,
            metadata: null,
            size_bytes: Buffer.byteLength(content, 'utf8'),
            created_at: createdAt.toISOString(),
            updated_at: new Date().toISOString()
        });
    }
}

/**
 * メイン処理
 */
async function main() {
    console.log('='.repeat(60));
    console.log('メモデータ BigQuery 移行スクリプト (from Backup)');
    console.log('='.repeat(60));

    // 引数チェック
    const backupSourceDir = process.argv[2];
    if (!backupSourceDir) {
        console.error('エラー: バックアップディレクトリのパスを指定してください。');
        console.error('使用方法: node scripts/migrate-memos-to-bigquery.js <BackupDir>');
        process.exit(1);
    }

    if (!fs.existsSync(backupSourceDir)) {
        console.error(`エラー: 指定されたディレクトリが存在しません: ${backupSourceDir}`);
        process.exit(1);
    }

    console.log(`ソースディレクトリ: ${backupSourceDir}`);

    let keyFile;
    try {
        keyFile = getCredentials();
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }

    const projectId = keyFile.project_id;
    console.log(`プロジェクトID: ${projectId}`);
    console.log(`データセット: ${DATASET_ID}`);
    console.log(`テーブル: ${TABLE_ID}`);
    console.log('');

    // BigQueryクライアント初期化
    const bigquery = new BigQuery({
        projectId,
        credentials: keyFile
    });

    // 移行対象ファイルを収集
    const records = [];

    console.log('ファイルをスキャン中...');

    // Scan Memo folder
    const memoDir = path.join(backupSourceDir, 'Memo');
    scanDirectory(memoDir, 'Memo', records);

    // Scan Cache folder (Category: Cache)
    // "Cache" フォルダ内のファイルは category='Cache' として扱う
    const cacheDir = path.join(backupSourceDir, 'Cache');
    scanDirectory(cacheDir, 'Cache', records);

    console.log('');
    console.log(`合計移行対象: ${records.length}件`);

    if (records.length === 0) {
        console.log('移行対象ファイルがありません。終了します。');
        process.exit(0);
    }

    // BigQueryにデータを挿入
    console.log('');
    console.log('BigQueryへデータを挿入中...');

    try {
        const table = bigquery.dataset(DATASET_ID).table(TABLE_ID);

        // 既存データをクリア (TRUNCATE)
        console.log(`  既存データをクリア中: \`${projectId}.${DATASET_ID}.${TABLE_ID}\``);
        await bigquery.query({
            query: `TRUNCATE TABLE \`${projectId}.${DATASET_ID}.${TABLE_ID}\``
        });
        console.log(`  クリア完了`);

        // 全データを対象とする
        const newRecords = records;

        if (newRecords.length > 0) {
            // バッチ処理（100件ずつ）
            const BATCH_SIZE = 100;
            let insertedCount = 0;
            for (let i = 0; i < newRecords.length; i += BATCH_SIZE) {
                const batch = newRecords.slice(i, i + BATCH_SIZE);
                try {
                    await table.insert(batch);
                    insertedCount += batch.length;
                    console.log(`  挿入済み: ${insertedCount}/${newRecords.length} 件`);
                } catch (batchError) {
                    console.error(`  バッチエラー (${i}〜${i + batch.length}):`, batchError.message);
                    if (batchError.errors) {
                        batchError.errors.forEach(e => console.error(`    - ${e.message}`));
                    }
                }
            }
            console.log(`  合計 ${insertedCount} 件のレコードを挿入しました`);
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('移行完了！');
        console.log('='.repeat(60));
        console.log('');
        console.log('確認用SQL:');
        console.log(`  SELECT file_id, category, title, created_at FROM \`${projectId}.${DATASET_ID}.${TABLE_ID}\` ORDER BY created_at DESC LIMIT 20;`);

    } catch (error) {
        console.error('');
        console.error('エラーが発生しました:', error.message);
        if (error.errors) {
            error.errors.forEach((e, i) => {
                console.error(`  [${i + 1}] ${e.message}`);
            });
        }
        process.exit(1);
    }
}

main().catch(console.error);
