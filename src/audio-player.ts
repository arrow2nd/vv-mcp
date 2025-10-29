import { promises as fs } from "fs";
import { tmpdir, platform } from "os";
import { join } from "path";
import { exec } from "child_process";

export class AudioPlayer {
  private playCount = 0;

  /**
   * プラットフォームに応じた音声再生コマンドを取得
   */
  private getPlayCommand(): string {
    const currentPlatform = platform();

    if (currentPlatform === "darwin") {
      return "afplay";
    }

    if (currentPlatform === "linux") {
      // Linux では paplay (PulseAudio) を優先的に使用
      // 利用できない場合は aplay (ALSA) を試す
      return "paplay";
    }

    throw new Error(
      `Unsupported platform: ${currentPlatform}. Only macOS and Linux are supported.`,
    );
  }

  async play(audioData: Buffer): Promise<void> {
    const tempFile = join(
      tmpdir(),
      `vv-mcp-${Date.now()}-${this.playCount++}.wav`,
    );

    try {
      // 一時ファイルに書き込み
      await fs.writeFile(tempFile, audioData);

      // プラットフォームに応じた再生コマンドを取得
      const playCommand = this.getPlayCommand();

      // 音声再生を実行し、完了まで待つ
      await new Promise<void>((resolve, reject) => {
        exec(`${playCommand} "${tempFile}"`, (error) => {
          if (error) {
            console.error("Audio playback error:", error);
            reject(error);
          } else {
            resolve();
          }

          // 再生が終わったらファイルを削除
          fs.unlink(tempFile).catch(() => {
            // エラーは無視
          });
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
