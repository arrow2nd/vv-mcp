import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { VoiceVoxService } from "../voicevox.js";

interface MockResponse {
  ok: boolean;
  json?: () => Promise<unknown>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
  statusText?: string;
}

interface Speaker {
  name: string;
  styles: Array<{
    id: number;
    name: string;
  }>;
}

describe("VoiceVoxService", () => {
  let service: VoiceVoxService;
  let fetchSpy: ReturnType<typeof spyOn>;
  const baseUrl = "http://localhost:50021";

  const createMockResponse = (config: MockResponse): Response => {
    return config as Response;
  };

  beforeEach(() => {
    service = new VoiceVoxService(baseUrl);
    fetchSpy = spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("getVoices", () => {
    it("should return voices list", async () => {
      const mockSpeakers: Speaker[] = [
        {
          name: "テストキャラクター",
          styles: [
            { id: 1, name: "ノーマル" },
            { id: 2, name: "楽々" },
          ],
        },
      ];

      fetchSpy.mockResolvedValue(createMockResponse({
        ok: true,
        json: () => Promise.resolve(mockSpeakers),
      }));

      const voices = await service.getVoices();

      expect(voices).toEqual([
        { character: "テストキャラクター", name: "ノーマル", id: 1 },
        { character: "テストキャラクター", name: "楽々", id: 2 },
      ]);
      expect(fetchSpy).toHaveBeenCalledWith(`${baseUrl}/speakers`);
    });

    it("should handle empty speakers list", async () => {
      fetchSpy.mockResolvedValue(createMockResponse({
        ok: true,
        json: () => Promise.resolve([]),
      }));

      const voices = await service.getVoices();

      expect(voices).toEqual([]);
    });
  });

  describe("synthesize", () => {
    it("should synthesize audio successfully", async () => {
      const mockQuery = { speedScale: 1.0 };
      const mockAudioBuffer = Buffer.from("fake audio data");

      fetchSpy
        .mockResolvedValueOnce(createMockResponse({
          ok: true,
          json: () => Promise.resolve(mockQuery),
        }))
        .mockResolvedValueOnce(createMockResponse({
          ok: true,
          arrayBuffer: () => Promise.resolve(mockAudioBuffer.buffer),
        }));

      const result = await service.synthesize("テストテキスト", 47, 1.5);

      expect(result).toBeInstanceOf(Buffer);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it("should throw error when audio_query fails", async () => {
      fetchSpy.mockResolvedValue(createMockResponse({
        ok: false,
        statusText: "Bad Request",
      }));

      expect(
        service.synthesize("テストテキスト", 47, 1.0),
      ).rejects.toThrow("Failed to create audio query: Bad Request");
    });
  });
});
