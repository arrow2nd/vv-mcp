import { promises as fs } from "fs";
import { tmpdir, platform } from "os";
import { join } from "path";
import { exec } from "child_process";

type PlayCommandInfo = {
  command: string;
  getArgs: (filePath: string) => string[];
};

export class AudioPlayer {
  private playCount = 0;

  /**
   * プラットフォームに応じた音声再生コマンド情報を取得
   */
  private getPlayCommandInfo(): PlayCommandInfo {
    const currentPlatform = platform();

    if (currentPlatform === "darwin") {
      return {
        command: "afplay",
        getArgs: (filePath) => [filePath],
      };
    }

    if (currentPlatform === "linux") {
      // Linux では paplay (PulseAudio) を優先的に使用
      return {
        command: "paplay",
        getArgs: (filePath) => [filePath],
      };
    }

    if (currentPlatform === "win32") {
      // Windows では PowerShell の System.Media.SoundPlayer を使用
      return {
        command: "powershell",
        getArgs: (filePath) => [
          "-NoProfile",
          "-Command",
          `(New-Object Media.SoundPlayer '${filePath.replace(/'/g, "''")}').PlaySync()`,
        ],
      };
    }

    throw new Error(
      `Unsupported platform: ${currentPlatform}. Only macOS, Linux, and Windows are supported.`,
    );
  }

  /**
   * プラットフォームに応じた再生コマンドを構築
   */
  private buildPlayCommand(filePath: string): string {
    const { command, getArgs } = this.getPlayCommandInfo();
    const args = getArgs(filePath);

    // Windows の場合は引数を適切にクォート
    if (platform() === "win32") {
      return `${command} ${args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`).join(" ")}`;
    }

    // Unix系の場合
    return `${command} "${filePath}"`;
  }

  async play(audioData: Buffer): Promise<void> {
    const tempFile = join(
      tmpdir(),
      `vv-mcp-${Date.now()}-${this.playCount++}.wav`,
    );

    try {
      // 一時ファイルに書き込み
      await fs.writeFile(tempFile, audioData);

      // プラットフォームに応じた再生コマンドを構築
      const playCommand = this.buildPlayCommand(tempFile);

      // 音声再生を実行し、完了まで待つ
      await new Promise<void>((resolve, reject) => {
        exec(playCommand, (error) => {
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
