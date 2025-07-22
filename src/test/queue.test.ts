import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Queue, type QueueTask } from "../queue.js";

describe("Queue", () => {
  let queue: Queue;
  let mockProcessor: ReturnType<typeof mock>;
  let mockSynthesizer: ReturnType<typeof mock>;

  beforeEach(() => {
    // デフォルトでは50ms遅延するプロセッサを使用
    mockProcessor = mock(() =>
      new Promise((resolve) => setTimeout(resolve, 50))
    );
    mockSynthesizer = mock(() =>
      Promise.resolve(Buffer.from("test audio data"))
    );
    queue = new Queue(mockProcessor, mockSynthesizer);
  });

  describe("enqueue", () => {
    it("should add task to queue and synthesize audio", async () => {
      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
      };

      await queue.enqueue(task);

      expect(mockSynthesizer).toHaveBeenCalledWith(task);

      // 処理が開始されるまで少し待つ
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = queue.getStatus();
      expect(status.size).toBe(0); // 処理中なので0になる
      expect(status.isProcessing).toBe(true);

      // 処理が完了するまで待つ
      await new Promise((resolve) => setTimeout(resolve, 60));
      const finalStatus = queue.getStatus();
      expect(finalStatus.isProcessing).toBe(false);
    });

    it("should process tasks in order", async () => {
      const tasks: QueueTask[] = [
        { text: "first", voiceId: 47, speed: 1.0 },
        { text: "second", voiceId: 47, speed: 1.0 },
        { text: "third", voiceId: 47, speed: 1.0 },
      ];

      // 各タスクを追加
      for (const task of tasks) {
        await queue.enqueue(task);
      }

      // 少し待つ
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(mockProcessor).toHaveBeenCalledTimes(3);
      expect(mockProcessor).toHaveBeenNthCalledWith(1, tasks[0]);
      expect(mockProcessor).toHaveBeenNthCalledWith(2, tasks[1]);
      expect(mockProcessor).toHaveBeenNthCalledWith(3, tasks[2]);
    });
  });

  describe("getStatus", () => {
    it("should return correct status", () => {
      const status = queue.getStatus();
      expect(status.size).toBe(0);
      expect(status.isProcessing).toBe(false);
      expect(status.currentTask).toBeUndefined();
    });

    it("should show processing status", async () => {
      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
      };

      await queue.enqueue(task);

      // 処理が開始されるまで少し待つ
      await new Promise((resolve) => setTimeout(resolve, 10));

      const status = queue.getStatus();
      expect(status.isProcessing).toBe(true);
      expect(status.currentTask).toEqual(task);

      // 処理が完了するまで待つ
      await new Promise((resolve) => setTimeout(resolve, 60));
      const finalStatus = queue.getStatus();
      expect(finalStatus.isProcessing).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all pending tasks", async () => {
      const tasks: QueueTask[] = [
        { text: "first", voiceId: 47, speed: 1.0 },
        { text: "second", voiceId: 47, speed: 1.0 },
      ];

      for (const task of tasks) {
        await queue.enqueue(task);
      }
      queue.clear();

      const status = queue.getStatus();
      expect(status.size).toBe(0);
    });
  });

  describe("error handling", () => {
    it("should handle processor errors gracefully", async () => {
      mockProcessor.mockRejectedValue(new Error("Processing failed"));

      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
      };

      await queue.enqueue(task);

      // エラーが発生してもキューが停止しないことを確認
      await new Promise((resolve) => setTimeout(resolve, 20));

      const status = queue.getStatus();
      expect(status.isProcessing).toBe(false);
    });

    it("should handle synthesis errors gracefully", async () => {
      mockSynthesizer.mockRejectedValue(new Error("Synthesis failed"));

      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
      };

      // 合成エラーが発生してもenqueueは成功する
      await queue.enqueue(task);

      expect(mockSynthesizer).toHaveBeenCalledWith(task);

      // タスクは音声データなしでキューに追加される
      const status = queue.getStatus();
      expect(status.size).toBe(0); // 処理中
    });
  });

  describe("pre-synthesis", () => {
    it("should use pre-synthesized audio data if available", async () => {
      const audioData = Buffer.from("pre-synthesized audio");
      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
        audioData: audioData,
      };

      await queue.enqueue(task);

      // 事前合成済みの場合、synthesizerは呼ばれない
      expect(mockSynthesizer).not.toHaveBeenCalled();

      // プロセッサには音声データ付きのタスクが渡される
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(mockProcessor).toHaveBeenCalledWith(task);
    });
  });
});
