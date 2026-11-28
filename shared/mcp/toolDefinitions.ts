/**
 * shared/mcp/toolDefinitions.ts
 * AI CLI に公開する Thinktank MCP ツールとリソーステンプレートの定義（JSON Schema）。
 * 外からは shared/mcpProtocol.ts を通して使う。
 */

import type { McpToolDefinition, McpResourceTemplateDefinition } from './types';

export const THINKTANK_MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'thinktank_search',
    description:
      'Thinktank Vault内のThink（メモ・課題・Project・チャット等）をキーワード・タグ・カテゴリ指定で全文検索し、一致したメタデータ一覧を返す。応答の truncated が true のときは上限で打ち切られているため、クエリを絞って再検索する。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '検索クエリ（スペース区切りでAND検索、#タグ、category:memo 等の指定が可能）',
        },
        category: {
          type: 'string',
          description: '絞り込むカテゴリ（memo, task, project, chat, links, table 等。省略時は全件）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 50、最大: 200）',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_list_meta',
    description:
      'Vault内の最新Thinkメタデータ一覧、または指定した projectId（Project）に紐づく関連Think一覧を取得する。応答の truncated が true のときは上限で打ち切られている。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '特定のProjectに属するThink一覧を取得する場合のthinkid',
        },
        category: {
          type: 'string',
          description: 'カテゴリによる絞り込み（memo, task, project, chat 等）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 50、最大: 200）',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_get_record',
    description:
      '指定した thinkid のThinkレコード全文（タイトル・本文・メタデータ・思考支援情報・updatedAt）を取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        thinkid: {
          type: 'string',
          description: '取得対象のThink ID（例: 2026-10-19-100000）',
        },
        includeSupport: {
          type: 'boolean',
          description: '思考支援・業務管理メタデータ（support）を含めるか（既定: true）',
        },
      },
      required: ['thinkid'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_get_project_context',
    description:
      '指定した projectId（Project）の全体文脈（目標・フェーズ・次アクション・関連Think一覧・公式レコード・昇格候補・Gate状態）を一括取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '対象のProjectのthinkid',
        },
      },
      required: ['projectId'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_create_think',
    description:
      '新しいThink（メモ・課題等）をVaultに作成し、必要に応じて指定した projectId（Project）に関連付ける。',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '新規Thinkのタイトル（1行目）',
        },
        body: {
          type: 'string',
          description: 'Thinkの本文（Markdown形式）',
        },
        category: {
          type: 'string',
          enum: ['memo', 'aiview', 'task', 'links', 'table'],
          description: 'Thinkの種別（既定: memo）。aiview はMarkdown形式のAI生成ビューで、アプリ上では読み取り専用。links は1件のURL/パスにつき1ファイルで、本文はタイトル行・「=」30個の行に続けて「# Caption」（参照タグの後ろに添える表示名。GDriveはファイル名/フォルダー名、GMailはメールタイトル、GPhotoは撮影日を「yyyy年MM月dd日撮影」の形で（1行目のタイトルも同じ）、パスは「File:ファイル名」か「Folder:フォルダー名」、その他はリンク先タイトルで不明ならAffiliationの値）「# Link」（URL、または引用符で囲んだパス）「# Affiliation」（URLはサーバーアドレス、パスは引用符で囲んだ「(PC名)親フォルダ」）「# Abstract」（概要）の見出しを置く',
        },
        keywords: {
          type: 'string',
          description: 'カンマ区切りのキーワード・タグ',
        },
        relatedIds: {
          type: 'string',
          description: '関連するThink ID（カンマ区切り）',
        },
        projectId: {
          type: 'string',
          description: '作成したThinkを自動的に紐づける親Projectのthinkid',
        },
        projectIds: {
          type: 'array',
          items: { type: 'string' },
          description: '複数のProjectへ同時に紐づける場合のthinkid配列（projectId と併用可。先頭が親Project）',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_update_think',
    description:
      '既存Thinkのタイトル・本文・キーワードを更新する。事前に thinktank_get_record で取得した expectedVersion（updatedAt）が必須。人間が画面で未保存編集中のThinkは保護のため更新できない。',
    inputSchema: {
      type: 'object',
      properties: {
        thinkid: {
          type: 'string',
          description: '更新対象のthinkid',
        },
        expectedVersion: {
          type: 'string',
          description: '楽観ロック用の現在バージョン（thinktank_get_record で取得した updatedAt）',
        },
        title: {
          type: 'string',
          description: '新しいタイトル（省略時は既存タイトルを維持）',
        },
        body: {
          type: 'string',
          description: '本文全体を置き換える場合の新しい本文（appendBody と同時指定不可）',
        },
        appendBody: {
          type: 'string',
          description: '既存の本文末尾に追記するテキスト（body と同時指定不可）',
        },
        keywords: {
          type: 'string',
          description: '新しいキーワード（省略時は既存を維持）',
        },
        relatedIds: {
          type: 'string',
          description: '新しい関連ID（省略時は既存を維持）',
        },
      },
      required: ['thinkid', 'expectedVersion'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_add_promotion_candidate',
    description:
      '対話や資料分析から抽出した重要決定（decision）・根拠（evidence）・リスク（risk）・前提（assumption）・アクション（action）・知見（learning）を、指定Projectの昇格候補（pending_review：人間によるレビュー待ち）として登録する。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '登録先Projectのthinkid',
        },
        type: {
          type: 'string',
          enum: ['decision', 'evidence', 'risk', 'assumption', 'action', 'gate_result', 'learning'],
          description: '昇格候補の種別',
        },
        title: {
          type: 'string',
          description: '昇格候補の簡潔なタイトル',
        },
        summary: {
          type: 'string',
          description: '要旨・結論',
        },
        rationale: {
          type: 'string',
          description: '背景・理由・根拠',
        },
        impactScope: {
          type: 'string',
          description: '影響範囲',
        },
        proposedOwner: {
          type: 'string',
          description: '想定担当者または決定者ロール',
        },
        dueDate: {
          type: 'string',
          description: '期限（任意）',
        },
        citations: {
          type: 'array',
          description: '根拠となったThinkの引用リスト',
          items: {
            type: 'object',
            properties: {
              sourceThinkid: { type: 'string' },
              sourceTitle: { type: 'string' },
              snippet: { type: 'string' },
            },
            required: ['sourceThinkid'],
          },
        },
      },
      required: ['projectId', 'type', 'title', 'summary'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_add_promotion_candidates',
    description:
      '同一Projectに対する昇格候補（pending_review）を1回の呼び出しで複数件まとめて登録する（最大20件）。1件でも引数が不正なら何も登録しない。承認・却下は人間が画面で行う。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: '登録先Projectのthinkid',
        },
        candidates: {
          type: 'array',
          description: '登録する昇格候補のリスト（1〜20件）。各要素は thinktank_add_promotion_candidate の projectId 以外の引数と同じ。',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['decision', 'evidence', 'risk', 'assumption', 'action', 'gate_result', 'learning'],
              },
              title: { type: 'string' },
              summary: { type: 'string' },
              rationale: { type: 'string' },
              impactScope: { type: 'string' },
              proposedOwner: { type: 'string' },
              dueDate: { type: 'string' },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sourceThinkid: { type: 'string' },
                    sourceTitle: { type: 'string' },
                    snippet: { type: 'string' },
                  },
                  required: ['sourceThinkid'],
                },
              },
            },
            required: ['type', 'title', 'summary'],
          },
        },
      },
      required: ['projectId', 'candidates'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_gmail_search',
    description:
      '利用者の Gmail を読み取り専用で検索し、スレッド一覧（threadId・件名・差出人・日時・スニペット・URL）を返す。メール送信や削除はできない。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail 検索クエリ（例: "newer_than:2d", "is:unread", "from:example.com"。省略時は "newer_than:3d"）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 20、最大: 50）',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_gmail_read',
    description:
      '指定した threadId の Gmail スレッド本文を読み取り専用で取得する。件名だけで判断せず本文と照合するために使う。',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: {
          type: 'string',
          description: 'thinktank_google_gmail_search で取得した threadId',
        },
        maxChars: {
          type: 'number',
          description: '1メッセージあたりの本文最大文字数（既定: 6000、最大: 12000）',
        },
      },
      required: ['threadId'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_calendar_events',
    description:
      '利用者の Google カレンダーから指定期間の予定一覧を読み取り専用で取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        startIso: {
          type: 'string',
          description: '開始日時の ISO8601 文字列（省略時は今日の 00:00）',
        },
        endIso: {
          type: 'string',
          description: '終了日時の ISO8601 文字列（省略時は開始から 7 日後）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 30、最大: 50）',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_tasks_list',
    description:
      '利用者の Google Tasks（ToDo）のリストとタスク一覧を読み取り専用で取得する。',
    inputSchema: {
      type: 'object',
      properties: {
        includeCompleted: {
          type: 'boolean',
          description: '完了済みタスクも含めるか（既定: false）',
        },
        limit: {
          type: 'number',
          description: '1リストあたりの最大取得件数（既定: 50、最大: 50）',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_drive_search',
    description:
      '利用者の Google ドライブからファイルを検索して一覧（id・名前・mimeType・更新日時・URL）を返す。',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'ファイル名・本文の検索キーワード（省略時は直近ファイル）',
        },
        folderId: {
          type: 'string',
          description: '特定のフォルダ配下に絞る場合の Google ドライブのフォルダ ID（任意）',
        },
        limit: {
          type: 'number',
          description: '最大取得件数（既定: 20、最大: 50）',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_drive_read',
    description:
      'Google ドライブの指定ファイル（Google ドキュメント・スプレッドシート・テキスト/Markdown/JSON）の内容を読み取る。',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: '読み取る Google ドライブの fileId',
        },
        maxChars: {
          type: 'number',
          description: '最大読み取り文字数（既定: 10000、最大: 12000）',
        },
      },
      required: ['fileId'],
      additionalProperties: false,
    },
  },
  {
    name: 'thinktank_google_drive_write',
    description:
      'Google ドライブにファイルを作成または更新・追記する（削除は不可）。既存ファイル更新時は fileId、新規作成時は name（任意で folderId・format）を指定する。',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: '既存ファイルを更新・追記する場合の fileId（省略時は新規作成）',
        },
        name: {
          type: 'string',
          description: '新規作成時のファイル名（fileId 省略時は必須）',
        },
        folderId: {
          type: 'string',
          description: '新規作成時の保存先フォルダ ID（省略時はマイドライブ直下）',
        },
        format: {
          type: 'string',
          enum: ['text', 'google_doc'],
          description: '新規作成時の形式（text または google_doc。既定: text）',
        },
        content: {
          type: 'string',
          description: '書き込む本文テキスト',
        },
        append: {
          type: 'boolean',
          description: '既存ファイル更新時に末尾へ追記するか（既定: false = 上書き）',
        },
      },
      required: ['content'],
      additionalProperties: false,
    },
  },
];

export const THINKTANK_MCP_RESOURCE_TEMPLATES: readonly McpResourceTemplateDefinition[] = [
  {
    uriTemplate: 'thinktank://think/{thinkid}',
    name: 'Think Record',
    description: '指定した thinkid のThinkレコード（メタデータ・本文・思考支援情報）',
    mimeType: 'application/json',
  },
  {
    uriTemplate: 'thinktank://profile/{profileId}',
    name: 'Domain Profile',
    description: 'Thinktank ドメインプロファイル定義（clinical-trial / elderly-support 等）',
    mimeType: 'application/json',
  },
];
