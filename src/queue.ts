import { SharedStateManager } from "./shared-state.js";

export interface QueueTask {
  text: string;
  voiceId: number;
  speed: number;
  audioData?: Buffer;
}

export interface QueueStatus {
  size: number;
  isProcessing: boolean;
  currentTask?: QueueTask;
}

export class Queue {
  private tasks: QueueTask[] = [];
  private isProcessing = false;
  private currentTask?: QueueTask;
  private synthesizer?: (task: QueueTask) => Promise<Buffer>;
  private sharedState: SharedStateManager;

  constructor(
    private processor: (task: QueueTask) => Promise<void>,
    synthesizer?: (task: QueueTask) => Promise<Buffer>,
  ) {
    this.synthesizer = synthesizer;
    this.sharedState = new SharedStateManager();
  }

  async enqueue(task: QueueTask): Promise<void> {
    // 音声合成を事前に実行
    if (this.synthesizer && !task.audioData) {
      try {
        task.audioData = await this.synthesizer(task);
      } catch (error) {
        console.error("Synthesis error during enqueue:", error);
        // 合成エラーがあっても、タスクはキューに追加して後で再試行できるようにする
      }
    }

    this.tasks.push(task);
    
    // キューに追加された音声を共有状態に記録
    try {
      await this.sharedState.addUsage(task.voiceId, "queued");
    } catch (error) {
      console.error("Failed to update shared state:", error);
    }
    
    this.processNext();
  }

  async clear(): Promise<void> {
    // キューに残っているタスクの共有状態を削除
    try {
      await this.sharedState.clearAllUsageForClient();
    } catch (error) {
      console.error("Failed to clear shared state:", error);
    }
    
    this.tasks = [];
  }

  getStatus(): QueueStatus {
    return {
      size: this.tasks.length,
      isProcessing: this.isProcessing,
      currentTask: this.currentTask,
    };
  }

  async getVoicesInUse(): Promise<number[]> {
    // 共有状態から全プロセスの使用中音声を取得
    try {
      return await this.sharedState.getVoicesInUse();
    } catch (error) {
      console.error("Failed to get voices in use:", error);
      // エラー時はローカルのキュー情報のみ返す
      const localVoices: number[] = [];
      if (this.currentTask) {
        localVoices.push(this.currentTask.voiceId);
      }
      this.tasks.forEach((task) => {
        localVoices.push(task.voiceId);
      });
      return [...new Set(localVoices)];
    }
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.tasks.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.currentTask = this.tasks.shift();

    try {
      if (this.currentTask) {
        // 再生開始時に状態を"playing"に更新
        try {
          await this.sharedState.addUsage(this.currentTask.voiceId, "playing");
        } catch (error) {
          console.error("Failed to update shared state to playing:", error);
        }

        await this.processor(this.currentTask);
      }
    } catch (error) {
      console.error("Queue processing error:", error);
    } finally {
      // 再生終了後に共有状態から削除
      if (this.currentTask) {
        try {
          await this.sharedState.removeUsage(this.currentTask.voiceId);
        } catch (error) {
          console.error("Failed to remove from shared state:", error);
        }
      }

      this.isProcessing = false;
      this.currentTask = undefined;

      // 次のタスクを処理
      if (this.tasks.length > 0) {
        this.processNext();
      }
    }
  }
}
