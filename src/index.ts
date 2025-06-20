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
const queue = new Queue(async (task) => {
  const audioData = await voicevox.synthesize(
    task.text,
    task.voiceId,
    task.speed,
  );
  await audioPlayer.play(audioData);
});

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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "say": {
      const { text, voiceId = DEFAULT_VOICE_ID, speed = DEFAULT_SPEED } =
        args as {
          text: string;
          voiceId?: number;
          speed?: number;
        };

      queue.enqueue({
        text,
        voiceId,
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
      queue.clear();
      return {
        content: [
          {
            type: "text",
            text: "キューをクリアしました",
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

