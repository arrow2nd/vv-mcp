import { promises as fs, accessSync, constants as fsConstants } from "fs";
import { tmpdir, platform } from "os";
import { join, delimiter } from "path";
import { exec } from "child_process";

type PlayCommandInfo = {
  command: string;
  getArgs: (filePath: string) => string[];
};

// PipeWire環境では pw-play、PulseAudio環境では paplay を使用するため
// PATH上で先に見つかったコマンドを採用する
const LINUX_PLAY_COMMAND_CANDIDATES = ["pw-play", "paplay"] as const;

export class AudioPlayer {
  private playCount = 0;
  private cachedLinuxCommand: string | null = null;

  /**
   * Linuxで利用可能な再生コマンドをPATHから検出
   * 毎回のプロセス起動で複数回呼ばれるためキャッシュする
   */
  private detectLinuxPlayCommand(): string {
    if (this.cachedLinuxCommand) {
      return this.cachedLinuxCommand;
    }

    const pathDirs = (process.env.PATH || "").split(delimiter).filter(Boolean);

    for (const candidate of LINUX_PLAY_COMMAND_CANDIDATES) {
      for (const dir of pathDirs) {
        try {
          // 実行可能ファイルが存在するかチェック（execSyncより高速で副作用がない）
          accessSync(join(dir, candidate), fsConstants.X_OK);
          this.cachedLinuxCommand = candidate;
          return candidate;
        } catch {
          // 存在しない or 実行不可なら次の候補へ
        }
      }
    }

    throw new Error(
      `No audio player command found on Linux. Install one of: ${LINUX_PLAY_COMMAND_CANDIDATES.join(", ")}`,
    );
  }

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
      // PipeWire (pw-play) / PulseAudio (paplay) を環境に応じて自動選択
      return {
        command: this.detectLinuxPlayCommand(),
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
