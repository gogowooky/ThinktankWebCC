'use strict';

/**
 * electron/aiCli/errors.cjs
 * AI CLI の実行で使うエラーの種類（instanceof で見分けるため、定義はここだけに置く）。
 * 外からは electron/aiCliRunner.cjs を通して使う。
 */

/** 許可していない操作を AI CLI が求めて止まった。stderr の英語の詳細は付けずに伝える */
class AiCliDeniedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiCliDeniedError';
  }
}

class AiCliError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiCliError';
  }
}

class AiCliCanceledError extends Error {
  constructor() {
    super('AI CLI の実行を中断しました。');
    this.name = 'AiCliCanceledError';
  }
}

module.exports = {
  AiCliDeniedError,
  AiCliError,
  AiCliCanceledError,
};
