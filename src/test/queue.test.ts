import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Queue, type QueueTask } from "../queue.js";

describe("Queue", () => {
  let queue: Queue;
  let mockProcessor: ReturnType<typeof mock>;

  beforeEach(() => {
    mockProcessor = mock(() => Promise.resolve());
    queue = new Queue(mockProcessor);
  });

  describe("enqueue", () => {
    it("should add task to queue", () => {
      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
      };

      queue.enqueue(task);

      const status = queue.getStatus();
      expect(status.size).toBe(0); // 処理中なので0になる
      expect(status.isProcessing).toBe(true);
    });

    it("should process tasks in order", async () => {
      const tasks: QueueTask[] = [
        { text: "first", voiceId: 47, speed: 1.0 },
        { text: "second", voiceId: 47, speed: 1.0 },
        { text: "third", voiceId: 47, speed: 1.0 },
      ];

      // 各タスクを追加
      tasks.forEach((task) => queue.enqueue(task));

      // 少し待つ
      await new Promise((resolve) => setTimeout(resolve, 100));

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

    it("should show processing status", () => {
      const task: QueueTask = {
        text: "テストテキスト",
        voiceId: 47,
        speed: 1.0,
      };

      queue.enqueue(task);

      const status = queue.getStatus();
      expect(status.isProcessing).toBe(true);
      expect(status.currentTask).toEqual(task);
    });
  });

  describe("clear", () => {
    it("should clear all pending tasks", () => {
      const tasks: QueueTask[] = [
        { text: "first", voiceId: 47, speed: 1.0 },
        { text: "second", voiceId: 47, speed: 1.0 },
      ];

      tasks.forEach((task) => queue.enqueue(task));
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

      queue.enqueue(task);

      // エラーが発生してもキューが停止しないことを確認
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = queue.getStatus();
      expect(status.isProcessing).toBe(false);
    });
  });
});
