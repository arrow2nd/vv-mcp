export interface QueueTask {
  text: string;
  voiceId: number;
  speed: number;
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

  constructor(private processor: (task: QueueTask) => Promise<void>) {}

  enqueue(task: QueueTask): void {
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

