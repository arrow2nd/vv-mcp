import fetch from "node-fetch";

export interface Voice {
  character: string;
  name: string;
  id: number;
}

export interface AudioQuery {
  speedScale: number;
  [key: string]: any;
}

export class VoiceVoxService {
  constructor(private baseUrl: string) {}

  async getVoices(): Promise<Voice[]> {
    const response = await fetch(`${this.baseUrl}/speakers`);
    const speakers = await response.json() as any[];

    const voices: Voice[] = [];
    for (const speaker of speakers) {
      for (const style of speaker.styles) {
        voices.push({
          character: speaker.name,
          name: style.name,
          id: style.id,
        });
      }
    }

    return voices;
  }

  async synthesize(
    text: string,
    voiceId: number,
    speed: number,
  ): Promise<Buffer> {
    // 音声クエリを作成
    const queryResponse = await fetch(
      `${this.baseUrl}/audio_query?speaker=${voiceId}&text=${
        encodeURIComponent(text)
      }`,
      { method: "POST" },
    );

    if (!queryResponse.ok) {
      throw new Error(
        `Failed to create audio query: ${queryResponse.statusText}`,
      );
    }

    const query = await queryResponse.json() as AudioQuery;

    // 話速を調整
    query.speedScale = speed;

    // 音声合成
    const synthesisResponse = await fetch(
      `${this.baseUrl}/synthesis?speaker=${voiceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      },
    );

    if (!synthesisResponse.ok) {
      throw new Error(
        `Failed to synthesize audio: ${synthesisResponse.statusText}`,
      );
    }

    const arrayBuffer = await synthesisResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

