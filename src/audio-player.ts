import { promises as fs } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { exec } from "child_process";

export class AudioPlayer {
  private playCount = 0;

  async play(audioData: Buffer): Promise<void> {
    const tempFile = join(
      tmpdir(),
      `vv-mcp-${Date.now()}-${this.playCount++}.wav`,
    );

    try {
      // 一時ファイルに書き込み
      await fs.writeFile(tempFile, audioData);

      // 音声再生を非同期で実行（完了を待たない）
      exec(`afplay "${tempFile}"`, (error) => {
        if (error) {
          console.error("Audio playback error:", error);
        }

        // 再生が終わったらファイルを削除
        fs.unlink(tempFile).catch(() => {
          // エラーは無視
        });
      });
    } catch (error) {
      // ファイル書き込みエラーの場合は削除を試みる
      try {
        await fs.unlink(tempFile);
      } catch {
        // エラーは無視
      }
      throw error;
    }
  }
}
