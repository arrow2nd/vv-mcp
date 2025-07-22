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

  constructor(
    private processor: (task: QueueTask) => Promise<void>,
    synthesizer?: (task: QueueTask) => Promise<Buffer>,
  ) {
    this.synthesizer = synthesizer;
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
    this.processNext();
  }

  clear(): void {
    this.tasks = [];
  }

  getStatus(): QueueStatus {
    return {
      size: this.tasks.length,
      isProcessing: this.isProcessing,
      currentTask: this.currentTask,
    };
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.tasks.length === 0) {
      return;
    }

    this.isProcessing = true;
    this.currentTask = this.tasks.shift();

    try {
      if (this.currentTask) {
        await this.processor(this.currentTask);
      }
    } catch (error) {
      console.error("Queue processing error:", error);
    } finally {
      this.isProcessing = false;
      this.currentTask = undefined;

      // 次のタスクを処理
      if (this.tasks.length > 0) {
        this.processNext();
      }
    }
  }
}
