# vv-mcp

VOICEVOX MCP Server - Claude DesktopとClaude Codeで音声合成を利用するためのMCPサーバー

> [!WARNING]
> このMCPサーバーは現在 **macOSのみ** 対応しています。音声再生に`afplay`コマンドを使用しているため、他のOSでは動作しません。

## 必要要件

- Node.js 18以上
- [VOICEVOX](https://voicevox.hiroshiba.jp/)がインストールされ、起動していること
- macOS（音声再生のため）

## インストール

### npmからインストール（推奨）

```bash
npm install -g @arrow2nd/vv-mcp
```

### ソースからビルド

```bash
git clone https://github.com/arrow2nd/vv-mcp.git
cd vv-mcp
npm install
npm run build
```

## Claude Desktop / Claude Codeでの設定

`~/Library/Application Support/Claude/claude_desktop_config.json`を編集：

### npmでインストールした場合

```json
{
  "mcpServers": {
    "vv-mcp": {
      "command": "npx",
      "args": ["-y", "@arrow2nd/vv-mcp"],
      "env": {
        "VOICEVOX_URL": "http://localhost:50021",
        "DEFAULT_VOICE_ID": "47",
        "DEFAULT_SPEED": "1.0"
      }
    }
  }
}
```

### ソースからビルドした場合

```json
{
  "mcpServers": {
    "vv-mcp": {
      "command": "node",
      "args": ["/path/to/vv-mcp/dist/index.js"],
      "env": {
        "VOICEVOX_URL": "http://localhost:50021",
        "DEFAULT_VOICE_ID": "47",
        "DEFAULT_SPEED": "1.0"
      }
    }
  }
}
```

## 使用方法

Claude Desktop/Codeを再起動後、以下のMCPツールが利用可能になります：

### 利用可能なツール

- `say` - テキストを音声合成して再生（非同期実行）
- `list_voices` - 利用可能な音声一覧を取得
- `get_queue_status` - 再生キューの状態を確認
- `clear_queue` - 再生キューをクリア
- `get_voices_in_use` - 現在使用中の音声IDのリストを取得（全プロセス共通）
- `get_random_unused_voice` - 使用されていない音声をランダムに1つ取得

### 使用例

```
「こんにちは」と言って
```

```
ナースロボの楽々な声で「完了しました」と言って
```

```
利用可能な音声を教えて
```

## 複数インスタンス対応

複数のClaude Desktop/Codeが同時に動作している場合、自動的に異なる音声を使用して音声の重複を避けます。

- 各プロセスで使用中の音声情報を共有
- `get_random_unused_voice`ツールで未使用の音声を自動選択
- 一時ディレクトリに状態ファイルを作成して情報を共有

## 環境変数

| 変数名              | デフォルト値           | 説明                                     |
| ------------------- | ---------------------- | ---------------------------------------- |
| VOICEVOX_URL        | http://localhost:50021 | VOICEVOX APIのURL                        |
| DEFAULT_VOICE_ID    | 47                     | デフォルトの音声ID (ナースロボ＿タイプＴ) |
| DEFAULT_SPEED       | 1.0                    | デフォルトの話速                         |
| VV_MCP_STATE_DIR    | システム一時ディレクトリ | 共有状態ファイルの保存ディレクトリ       |

## ライセンス

MIT