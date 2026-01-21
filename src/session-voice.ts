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
      const availableVoiceIds = allVoices.map((voice) => voice.id);

      // 音声の選択と登録をアトミックに実行
      this.sessionVoiceId = await this.sharedState.selectAndRegisterVoice(
        availableVoiceIds,
        this.defaultVoiceId,
      );

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

