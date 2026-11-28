import { readFile } from 'node:fs/promises';
import { formatHarnessTiming, harnessStageTotals, TIMING_STAGES } from '../electron/shared-dist/harnessTiming.js';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('使い方: npm run perf:harness -- <AIChatで保存したJSON> [比較するJSON ...]');
  process.exitCode = 1;
}
const reports = [];
for (const file of files) {
  try {
    const report = JSON.parse(await readFile(file, 'utf8'));
    if (report?.version !== 1 || !Array.isArray(report.stages) || !Array.isArray(report.calls)) {
      throw new Error('ハーネスの計測ファイル（version 1）を指定してください。');
    }
    console.log(file + '\n' + formatHarnessTiming(report) + '\n');
    reports.push({ file, report });
  } catch (error) {
    console.error(file + ': ' + error.message);
    process.exitCode = 1;
  }
}

if (reports.length > 1 && !process.exitCode) {
  const [baseline, ...others] = reports;
  const before = harnessStageTotals(baseline.report);
  const seconds = ms => (ms / 1000).toFixed(3);
  const row = (name, a, b) =>
    `${name}　${seconds(a)} → ${seconds(b)}秒 （${b > a ? '+' : ''}${seconds(b - a)}秒）`;
  for (const { file, report } of others) {
    const after = harnessStageTotals(report);
    console.log(`差分　${baseline.file} → ${file}（マイナスは短縮）`);
    console.log(row('全体', baseline.report.totalMs, report.totalMs));
    for (const [stage, label] of Object.entries(TIMING_STAGES)) {
      if (before.has(stage) || after.has(stage)) {
        console.log(row(label, before.get(stage) ?? 0, after.get(stage) ?? 0));
      }
    }
  }
}
