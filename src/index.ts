#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { VoiceVoxService } from "./voicevox.js";
import { AudioPlayer } from "./audio-player.js";
import { Queue } from "./queue.js";
import { SessionVoice } from "./session-voice.js";

const VOICEVOX_URL = process.env.VOICEVOX_URL || "http://127.0.0.1:50021";
const DEFAULT_VOICE_ID = parseInt(process.env.DEFAULT_VOICE_ID || "47");
const DEFAULT_SPEED = parseFloat(process.env.DEFAULT_SPEED || "1.0");

const server = new Server(
  {
    name: "vv-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const voicevox = new VoiceVoxService(VOICEVOX_URL);
const audioPlayer = new AudioPlayer();
const sessionVoice = new SessionVoice(voicevox, DEFAULT_VOICE_ID);
const queue = new Queue(
  async (task) => {
    // 音声データがすでに合成されている場合はそれを使用
    if (task.audioData) {
      await audioPlayer.play(task.audioData);
    } else {
      // フォールバック: 合成が失敗した場合はここで合成
      const audioData = await voicevox.synthesize(
        task.text,
        task.voiceId,
        task.speed,
      );
      await audioPlayer.play(audioData);
    }
  },
  // 事前合成関数
  async (task) => {
    return await voicevox.synthesize(
      task.text,
      task.voiceId,
      task.speed,
    );
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "say",
      description: "VOICEVOXで音声合成して再生（非同期実行）",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "読み上げるテキスト",
          },
          voiceId: {
            type: "number",
            description: `音声ID（デフォルト: ${DEFAULT_VOICE_ID}）`,
            default: DEFAULT_VOICE_ID,
          },
          speed: {
            type: "number",
            description: `話速（デフォルト: ${DEFAULT_SPEED}）`,
            default: DEFAULT_SPEED,
            minimum: 0.5,
            maximum: 2.0,
          },
          useSessionVoice: {
            type: "boolean",
            description: "セッション音声を使用するか（デフォルト: false）",
            default: false,
          },
        },
        required: ["text"],
      },
    },
    {
      name: "list_voices",
      description: "利用可能な音声の一覧を取得",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_queue_status",
      description: "再生キューの状態を取得",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "clear_queue",
      description: "再生キューをクリア",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_voices_in_use",
      description: "現在使用中の音声IDのリストを取得（全プロセス共通）",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_random_unused_voice",
      description: "使用されていない音声をランダムに1つ取得",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_session_voice",
      description: "このセッションで使用する音声を取得（セッション毎に固定）",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "say": {
      const { text, voiceId = DEFAULT_VOICE_ID, speed = DEFAULT_SPEED, useSessionVoice = false } =
        args as {
          text: string;
          voiceId?: number;
          speed?: number;
          useSessionVoice?: boolean;
        };

      // セッション音声を使用する場合は音声IDを上書き
      let actualVoiceId = voiceId;
      if (useSessionVoice) {
        const sessionInfo = await sessionVoice.getSessionVoice();
        actualVoiceId = sessionInfo.voiceId;
      }

      try {
        await queue.enqueue({
          text,
          voiceId: actualVoiceId,
          speed,
        });

        return {
          content: [
            {
              type: "text",
              text:
                `キューに追加しました（現在のキュー数: ${queue.getStatus().size}）`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `エラー: ${
                error instanceof Error ? error.message : "不明なエラー"
              }`,
            },
          ],
        };
      }
    }

    case "list_voices": {
      const voices = await voicevox.getVoices();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(voices, null, 2),
          },
        ],
      };
    }

    case "get_queue_status": {
      const status = queue.getStatus();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }

    case "clear_queue": {
      await queue.clear();
      return {
        content: [
          {
            type: "text",
            text: "キューをクリアしました",
          },
        ],
      };
    }

    case "get_voices_in_use": {
      const voicesInUse = await queue.getVoicesInUse();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              voicesInUse,
              count: voicesInUse.length,
            }, null, 2),
          },
        ],
      };
    }

    case "get_random_unused_voice": {
      // 利用可能な全音声を取得
      const allVoices = await voicevox.getVoices();
      const voicesInUse = await queue.getVoicesInUse();
      
      // 使用されていない音声を抽出
      const unusedVoices = allVoices.filter(
        (voice) => !voicesInUse.includes(voice.id),
      );
      
      let selectedVoice;
      if (unusedVoices.length > 0) {
        // 未使用の音声からランダムに選択
        const randomIndex = Math.floor(Math.random() * unusedVoices.length);
        selectedVoice = unusedVoices[randomIndex];
      } else {
        // 全ての音声が使用中の場合は、全音声からランダムに選択
        const randomIndex = Math.floor(Math.random() * allVoices.length);
        selectedVoice = allVoices[randomIndex];
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              voice: selectedVoice,
              isUnused: unusedVoices.length > 0,
              totalVoices: allVoices.length,
              unusedCount: unusedVoices.length,
            }, null, 2),
          },
        ],
      };
    }

    case "get_session_voice": {
      try {
        const sessionInfo = await sessionVoice.getSessionVoice();
        const voices = await voicevox.getVoices();
        const selectedVoice = voices.find((v) => v.id === sessionInfo.voiceId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                voice: selectedVoice,
                sessionInfo: sessionInfo.sessionInfo,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `エラー: ${
                error instanceof Error ? error.message : "不明なエラー"
              }`,
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // プロセス終了時にセッション音声をクリーンアップ
  const cleanup = async () => {
    await sessionVoice.cleanup();
    await queue.clear();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch(console.error);
