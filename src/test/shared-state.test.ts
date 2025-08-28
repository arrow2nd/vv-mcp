import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SharedStateManager } from "../shared-state.js";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("SharedStateManager", () => {
  let manager: SharedStateManager;
  const testDir = join(tmpdir(), "vv-mcp-test-" + Date.now());
  const testFilePath = join(testDir, "vv-mcp-voice-usage.json");

  beforeEach(async () => {
    // テスト用ディレクトリを作成
    await fs.mkdir(testDir, { recursive: true });
    process.env.VV_MCP_STATE_DIR = testDir;
    manager = new SharedStateManager();
  });

  afterEach(async () => {
    // テスト用ディレクトリをクリーンアップ
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // エラーは無視
    }
    delete process.env.VV_MCP_STATE_DIR;
  });

  test("初期状態では空の配列を返す", async () => {
    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([]);
  });

  test("音声使用状況を追加できる", async () => {
    await manager.addUsage(1, "playing");
    const voices = await manager.getVoicesInUse();
    expect(voices).toContain(1);
  });

  test("複数の音声を追加できる", async () => {
    await manager.addUsage(1, "playing");
    await manager.addUsage(2, "queued");
    await manager.addUsage(3, "playing");

    const voices = await manager.getVoicesInUse();
    expect(voices).toHaveLength(3);
    expect(voices).toContain(1);
    expect(voices).toContain(2);
    expect(voices).toContain(3);
  });

  test("同じ音声IDを複数回追加しても重複しない", async () => {
    await manager.addUsage(1, "playing");
    await manager.addUsage(1, "queued");

    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([1]);
  });

  test("音声使用状況を削除できる", async () => {
    await manager.addUsage(1, "playing");
    await manager.addUsage(2, "queued");

    await manager.removeUsage(1);

    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([2]);
  });

  test("存在しない音声を削除してもエラーにならない", async () => {
    await manager.removeUsage(999);
    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([]);
  });

  test("クライアントの全使用状況をクリアできる", async () => {
    await manager.addUsage(1, "playing");
    await manager.addUsage(2, "queued");
    await manager.addUsage(3, "playing");

    await manager.clearAllUsageForClient();

    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([]);
  });

  test("異なるクライアントの使用状況を区別する", async () => {
    // 1つ目のマネージャーで音声を追加
    await manager.addUsage(1, "playing");

    // 2つ目のマネージャーを作成（異なるクライアントID）
    const manager2 = new SharedStateManager();
    await manager2.addUsage(2, "playing");

    // 両方の音声が表示される
    const voices = await manager.getVoicesInUse();
    expect(voices).toHaveLength(2);
    expect(voices).toContain(1);
    expect(voices).toContain(2);

    // 1つ目のクライアントをクリア
    await manager.clearAllUsageForClient();

    // 2つ目のクライアントの音声のみ残る
    const voicesAfterClear = await manager2.getVoicesInUse();
    expect(voicesAfterClear).toEqual([2]);
  });

  test("ロックファイルの競合を処理できる", async () => {
    // 複数の操作を同時に実行
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(manager.addUsage(i, "playing"));
    }

    await Promise.all(promises);

    const voices = await manager.getVoicesInUse();
    expect(voices).toHaveLength(5);
  });

  test("破損したJSONファイルを処理できる", async () => {
    // 不正なJSONを書き込む
    await fs.writeFile(testFilePath, "{ invalid json");

    // エラーなく読み込めることを確認
    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([]);
  });

  test("古いエントリは自動的にクリーンアップされる", async () => {
    // タイムスタンプを操作するためのモック
    const oldTimestamp = Date.now() - (6 * 60 * 1000); // 6分前
    const mockEntry = {
      entries: [
        {
          voiceId: 1,
          clientId: "old-client",
          timestamp: oldTimestamp,
          status: "playing",
        },
        {
          voiceId: 2,
          clientId: manager.getClientId(),
          timestamp: Date.now(),
          status: "playing",
        },
      ],
      lastUpdated: Date.now(),
    };

    await fs.writeFile(testFilePath, JSON.stringify(mockEntry));

    const voices = await manager.getVoicesInUse();
    expect(voices).toEqual([2]); // 古いエントリは除外される
  });

  test("クライアントIDが一意である", () => {
    const manager2 = new SharedStateManager();
    expect(manager.getClientId()).not.toBe(manager2.getClientId());
  });
});

