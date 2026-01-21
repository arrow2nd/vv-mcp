import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface VoiceUsageEntry {
  voiceId: number;
  clientId: string;
  timestamp: number;
  status: "playing" | "queued";
}

export interface SharedVoiceUsage {
  entries: VoiceUsageEntry[];
  lastUpdated: number;
}

export class SharedStateManager {
  private static readonly FILENAME = "vv-mcp-voice-usage.json";
  private static readonly TIMEOUT_MS = 5 * 60 * 1000; // 5分
  private static readonly LOCK_TIMEOUT_MS = 1000; // ロック用タイムアウト
  private static readonly MAX_RETRY = 5;

  private filePath: string;
  private lockPath: string;
  private clientId: string;

  constructor() {
    const dir = process.env.VV_MCP_STATE_DIR || tmpdir();
    this.filePath = join(dir, SharedStateManager.FILENAME);
    this.lockPath = `${this.filePath}.lock`;
    // プロセスIDをクライアントIDとして使用（同一セッション内で一貫した値を保つため）
    this.clientId = `${process.pid}`;
  }

  private async acquireLock(retries = 0): Promise<boolean> {
    try {
      await fs.writeFile(this.lockPath, this.clientId, { flag: "wx" });
      return true;
    } catch (error: any) {
      if (error.code === "EEXIST" && retries < SharedStateManager.MAX_RETRY) {
        // ロックファイルが存在する場合、古いロックかチェック
        try {
          const stat = await fs.stat(this.lockPath);
          const age = Date.now() - stat.mtimeMs;
          if (age > SharedStateManager.LOCK_TIMEOUT_MS) {
            // 古いロックファイルを削除
            await fs.unlink(this.lockPath);
          }
        } catch {
          // ロックファイルが既に削除されている可能性
        }
        // リトライ
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.acquireLock(retries + 1);
      }
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    try {
      await fs.unlink(this.lockPath);
    } catch {
      // ロックファイルが既に削除されている可能性
    }
  }

  private async readState(): Promise<SharedVoiceUsage> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === "ENOENT") {
        // ファイルが存在しない場合は初期状態を返す
        return { entries: [], lastUpdated: Date.now() };
      }
      // JSONパースエラーなどの場合も初期状態を返す
      return { entries: [], lastUpdated: Date.now() };
    }
  }

  private async writeState(state: SharedVoiceUsage): Promise<void> {
    state.lastUpdated = Date.now();
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  private cleanupOldEntries(state: SharedVoiceUsage): SharedVoiceUsage {
    const now = Date.now();
    const activeEntries = state.entries.filter(
      (entry) => now - entry.timestamp < SharedStateManager.TIMEOUT_MS,
    );
    return { ...state, entries: activeEntries };
  }

  async addUsage(voiceId: number, status: "playing" | "queued"): Promise<void> {
    const locked = await this.acquireLock();
    if (!locked) {
      throw new Error("Failed to acquire lock for shared state");
    }

    try {
      let state = await this.readState();
      state = this.cleanupOldEntries(state);

      // 既存のエントリを更新または新規追加
      const existingIndex = state.entries.findIndex(
        (e) => e.clientId === this.clientId && e.voiceId === voiceId,
      );

      const entry: VoiceUsageEntry = {
        voiceId,
        clientId: this.clientId,
        timestamp: Date.now(),
        status,
      };

      if (existingIndex >= 0) {
        state.entries[existingIndex] = entry;
      } else {
        state.entries.push(entry);
      }

      await this.writeState(state);
    } finally {
      await this.releaseLock();
    }
  }

  async removeUsage(voiceId: number): Promise<void> {
    const locked = await this.acquireLock();
    if (!locked) {
      throw new Error("Failed to acquire lock for shared state");
    }

    try {
      let state = await this.readState();
      state = this.cleanupOldEntries(state);

      // このクライアントのエントリを削除
      state.entries = state.entries.filter(
        (e) => !(e.clientId === this.clientId && e.voiceId === voiceId),
      );

      await this.writeState(state);
    } finally {
      await this.releaseLock();
    }
  }

  async getVoicesInUse(): Promise<number[]> {
    const locked = await this.acquireLock();
    if (!locked) {
      // ロックが取得できない場合でも読み取りは試みる
      const state = await this.readState();
      const cleanedState = this.cleanupOldEntries(state);
      return [...new Set(cleanedState.entries.map((e) => e.voiceId))];
    }

    try {
      let state = await this.readState();
      state = this.cleanupOldEntries(state);
      await this.writeState(state); // クリーンアップ後の状態を保存

      // 重複を除いた音声IDのリストを返す
      return [...new Set(state.entries.map((e) => e.voiceId))];
    } finally {
      await this.releaseLock();
    }
  }

  async clearAllUsageForClient(): Promise<void> {
    const locked = await this.acquireLock();
    if (!locked) {
      throw new Error("Failed to acquire lock for shared state");
    }

    try {
      let state = await this.readState();
      state = this.cleanupOldEntries(state);

      // このクライアントの全エントリを削除
      state.entries = state.entries.filter(
        (e) => e.clientId !== this.clientId,
      );

      await this.writeState(state);
    } finally {
      await this.releaseLock();
    }
  }

  getClientId(): string {
    return this.clientId;
  }

  /**
   * 音声の選択と登録をアトミックに行う
   * レースコンディションを防ぐため、単一ロック内で実行
   */
  async selectAndRegisterVoice(
    availableVoiceIds: number[],
    defaultVoiceId: number,
  ): Promise<number> {
    const locked = await this.acquireLock();
    if (!locked) {
      throw new Error("Failed to acquire lock for voice selection");
    }

    try {
      let state = await this.readState();
      state = this.cleanupOldEntries(state);

      // 現在使用中の音声IDを取得
      const voicesInUse = new Set(state.entries.map((e) => e.voiceId));

      // 未使用の音声を抽出
      const unusedVoices = availableVoiceIds.filter(
        (id) => !voicesInUse.has(id),
      );

      let selectedVoiceId: number;

      // デフォルト音声が未使用なら優先的に使用
      if (!voicesInUse.has(defaultVoiceId)) {
        selectedVoiceId = defaultVoiceId;
      } else if (unusedVoices.length > 0) {
        // 未使用の音声からランダムに選択
        const randomIndex = Math.floor(Math.random() * unusedVoices.length);
        selectedVoiceId = unusedVoices[randomIndex];
      } else {
        // 全ての音声が使用中の場合は、使用頻度の低い音声を選択
        const usageCount = new Map<number, number>();
        state.entries.forEach((entry) => {
          usageCount.set(entry.voiceId, (usageCount.get(entry.voiceId) || 0) + 1);
        });

        const minCount = Math.min(...Array.from(usageCount.values()));
        const leastUsedVoices = availableVoiceIds.filter(
          (id) => (usageCount.get(id) || 0) === minCount,
        );

        const randomIndex = Math.floor(Math.random() * leastUsedVoices.length);
        selectedVoiceId = leastUsedVoices[randomIndex] ?? defaultVoiceId;
      }

      // 選択した音声を "queued" として登録
      const entry: VoiceUsageEntry = {
        voiceId: selectedVoiceId,
        clientId: this.clientId,
        timestamp: Date.now(),
        status: "queued",
      };

      const existingIndex = state.entries.findIndex(
        (e) => e.clientId === this.clientId && e.voiceId === selectedVoiceId,
      );

      if (existingIndex >= 0) {
        state.entries[existingIndex] = entry;
      } else {
        state.entries.push(entry);
      }

      await this.writeState(state);

      return selectedVoiceId;
    } finally {
      await this.releaseLock();
    }
  }
}