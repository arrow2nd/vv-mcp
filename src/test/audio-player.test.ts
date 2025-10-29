import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { AudioPlayer } from "../audio-player.js";
import * as fs from "fs";
import * as child_process from "child_process";

type ExecCallback = (
  error: Error | null,
  stdout?: string,
  stderr?: string,
) => void;

interface MockChildProcess {
  pid?: number;
  stdin?: NodeJS.WritableStream;
  stdout?: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  killed?: boolean;
  kill?: (signal?: string) => boolean;
}

describe("AudioPlayer", () => {
  let player: AudioPlayer;
  let writeFileSpy: ReturnType<typeof spyOn>;
  let unlinkSpy: ReturnType<typeof spyOn>;
  let execSpy: ReturnType<typeof spyOn>;

  const createMockChildProcess = (): MockChildProcess => ({
    pid: 12345,
    killed: false,
  });

  beforeEach(() => {
    player = new AudioPlayer();
    writeFileSpy = spyOn(fs.promises, "writeFile");
    unlinkSpy = spyOn(fs.promises, "unlink");
    execSpy = spyOn(child_process, "exec");
  });

  afterEach(() => {
    writeFileSpy.mockRestore();
    unlinkSpy.mockRestore();
    execSpy.mockRestore();
  });

  describe("play", () => {
    it("should write audio file and execute platform-specific player", async () => {
      const audioData = Buffer.from("fake audio data");

      writeFileSpy.mockResolvedValue(undefined);
      execSpy.mockImplementation((_command: string, callback: ExecCallback) => {
        callback(null);
        return createMockChildProcess() as child_process.ChildProcess;
      });

      await player.play(audioData);

      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(execSpy).toHaveBeenCalledTimes(1);

      const execCall = execSpy.mock.calls[0];
      // macOS (afplay) または Linux (paplay) のいずれかのコマンドが使用されることを確認
      expect(execCall[0]).toMatch(/^(afplay|paplay) ".*\.wav"$/);
    });

    it("should handle write file errors", async () => {
      const audioData = Buffer.from("fake audio data");
      const writeError = new Error("Write failed");

      writeFileSpy.mockRejectedValue(writeError);
      unlinkSpy.mockResolvedValue(undefined);

      expect(player.play(audioData)).rejects.toThrow("Write failed");
      expect(unlinkSpy).toHaveBeenCalledTimes(1);
    });

    it("should handle audio player execution errors gracefully", async () => {
      const audioData = Buffer.from("fake audio data");

      writeFileSpy.mockResolvedValue(undefined);
      execSpy.mockImplementation((_command: string, callback: ExecCallback) => {
        callback(new Error("playback failed"));
        return createMockChildProcess() as child_process.ChildProcess;
      });

      // エラーが投げられることを確認（同期実行になったため）
      await expect(player.play(audioData)).rejects.toThrow("playback failed");
      expect(writeFileSpy).toHaveBeenCalledTimes(1);
      expect(execSpy).toHaveBeenCalledTimes(1);
    });
  });
});
