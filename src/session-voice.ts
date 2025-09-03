import { VoiceVoxService } from "./voicevox.js";
import { SharedStateManager } from "./shared-state.js";

export class SessionVoice {
  private sessionVoiceId?: number;
  private sessionStartTime: number;
  private sharedState: SharedStateManager;

  constructor(
    private voicevox: VoiceVoxService,
    private defaultVoiceId: number,
  ) {
    this.sessionStartTime = Date.now();
    this.sharedState = new SharedStateManager();
  }

  async initializeSession(): Promise<number> {
    if (this.sessionVoiceId !== undefined) {
      return this.sessionVoiceId;
    }

    try {
      // 利用可能な全音声を取得
      const allVoices = await this.voicevox.getVoices();
      const voicesInUse = await this.sharedState.getVoicesInUse();

      // 使用されていない音声を抽出
      const unusedVoices = allVoices.filter(
        (voice) => !voicesInUse.includes(voice.id),
      );

      let selectedVoice;
      if (unusedVoices.length > 0) {
        // 未使用の音声からランダムに選択
        const randomIndex = Math.floor(Math.random() * unusedVoices.length);
        selectedVoice = unusedVoices[randomIndex];
      } else {
        // 全ての音声が使用中の場合は、使用頻度の低い音声を選択
        // まず各音声の使用回数をカウント
        const usageCount = new Map<number, number>();
        voicesInUse.forEach((voiceId) => {
          usageCount.set(voiceId, (usageCount.get(voiceId) || 0) + 1);
        });

        // 最も使用頻度の低い音声を選択
        const leastUsedVoices = allVoices.filter((voice) => {
          const count = usageCount.get(voice.id) || 0;
          return count === Math.min(...Array.from(usageCount.values()));
        });

        const randomIndex = Math.floor(Math.random() * leastUsedVoices.length);
        selectedVoice = leastUsedVoices[randomIndex] || allVoices[0];
      }

      this.sessionVoiceId = selectedVoice.id;

      // セッション音声として使用状況を記録
      await this.sharedState.addUsage(this.sessionVoiceId, "queued");

      return this.sessionVoiceId;
    } catch (error) {
      console.error("Failed to initialize session voice:", error);
      // エラー時はデフォルト音声を使用
      this.sessionVoiceId = this.defaultVoiceId;
      return this.sessionVoiceId;
    }
  }

  async getSessionVoice(): Promise<{
    voiceId: number;
    sessionInfo: {
      startTime: number;
      durationMs: number;
      clientId: string;
    };
  }> {
    const voiceId = await this.initializeSession();

    return {
      voiceId,
      sessionInfo: {
        startTime: this.sessionStartTime,
        durationMs: Date.now() - this.sessionStartTime,
        clientId: this.sharedState.getClientId(),
      },
    };
  }

  async cleanup(): Promise<void> {
    if (this.sessionVoiceId !== undefined) {
      try {
        await this.sharedState.removeUsage(this.sessionVoiceId);
      } catch (error) {
        console.error("Failed to cleanup session voice:", error);
      }
    }
  }

  getSessionVoiceId(): number | undefined {
    return this.sessionVoiceId;
  }
}