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

## 環境変数

| 変数名           | デフォルト値           | 説明                                     |
| ---------------- | ---------------------- | ---------------------------------------- |
| VOICEVOX_URL     | http://localhost:50021 | VOICEVOX APIのURL                        |
| DEFAULT_VOICE_ID | 47                     | デフォルトの音声ID (ナースロボ＿タイプＴ) |
| DEFAULT_SPEED    | 1.0                    | デフォルトの話速                         |

## ライセンス

MIT