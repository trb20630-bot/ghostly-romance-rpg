import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ===== Voice Map =====
const VOICE_MAP: Record<string, string> = {
  // Narration
  narrator: "zh-CN-YunyangNeural",
  // Male characters
  寧采臣: "zh-CN-YunxiNeural",
  燕赤霞: "zh-CN-YunzeNeural",
  // Female characters
  聶小倩: "zh-CN-XiaoxiaoNeural",
  小倩: "zh-CN-XiaoxiaoNeural",
  姥姥: "zh-CN-XiaochenNeural",
  // Defaults
  male_default: "zh-CN-YunjianNeural",
  female_default: "zh-CN-XiaoyiNeural",
};

// Known character names for detection
const KNOWN_CHARACTERS = ["寧采臣", "聶小倩", "小倩", "燕赤霞", "姥姥"];
const MALE_HINTS = ["寧采臣", "燕赤霞", "書生", "道士", "劍客", "先生", "老爺", "公子", "大師", "兄"];
const FEMALE_HINTS = ["聶小倩", "小倩", "姥姥", "小姐", "姑娘", "夫人", "娘子", "女鬼", "仙子"];

interface TtsSegment {
  voice: string;
  text: string;
}

/**
 * POST /api/tts
 * body: { text, mode?: "smart"|"single", voice?: string, rate?: number }
 * mode=smart: multi-voice with character detection (default)
 * mode=single: single voice (legacy)
 */
export async function POST(request: NextRequest) {
  try {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || "eastasia";

    if (!key) {
      return NextResponse.json({ error: "AZURE_SPEECH_KEY not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { text, mode = "smart", voice = "narrator", rate = 1 } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "缺少文字內容" }, { status: 400 });
    }

    const trimmedText = cleanForTts(text.slice(0, 10000));
    const rateStr = rate === 1 ? "default" : `${Math.round(rate * 100)}%`;

    let ssml: string;

    if (mode === "smart") {
      // Parse text into segments with different voices
      const segments = parseSegments(trimmedText);
      ssml = buildMultiVoiceSsml(segments, rateStr);
    } else {
      // Single voice mode
      const voiceName = VOICE_MAP[voice] || VOICE_MAP.narrator;
      ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voiceName}">
    <prosody rate="${rateStr}">${escapeXml(trimmedText)}</prosody>
  </voice>
</speak>`;
    }

    const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

    const response = await fetch(ttsUrl, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Azure TTS error:", response.status, errText);
      return NextResponse.json(
        { error: `Azure TTS 錯誤 (${response.status})` },
        { status: response.status }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error("TTS API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "語音合成失敗" },
      { status: 500 }
    );
  }
}

/**
 * Parse text into voice segments:
 * - Text inside 「」with character context → character voice
 * - Text outside 「」 → narrator voice
 */
function parseSegments(text: string): TtsSegment[] {
  const segments: TtsSegment[] = [];
  // Regex to match: optional context before quote + quoted dialogue
  const parts = text.split(/(「[^」]*」)/g);

  let lastSpeaker = "";

  for (const part of parts) {
    if (!part.trim()) continue;

    if (part.startsWith("「") && part.endsWith("」")) {
      // Dialogue — detect speaker from surrounding context
      const dialogue = part.slice(1, -1);
      const speaker = detectSpeaker(text, part, lastSpeaker);
      const voiceName = getVoiceForSpeaker(speaker);
      lastSpeaker = speaker;
      segments.push({ voice: voiceName, text: dialogue });
    } else {
      // Narration
      segments.push({ voice: VOICE_MAP.narrator, text: part });

      // Check if this narration mentions a character (for next dialogue)
      for (const name of KNOWN_CHARACTERS) {
        if (part.includes(name)) {
          lastSpeaker = name;
        }
      }
    }
  }

  return segments;
}

/**
 * Detect who is speaking based on surrounding text
 */
function detectSpeaker(fullText: string, quotePart: string, lastSpeaker: string): string {
  const quoteIdx = fullText.indexOf(quotePart);
  // Check ~40 chars before the quote for character names
  const beforeText = fullText.slice(Math.max(0, quoteIdx - 40), quoteIdx);

  // Look for known character names near the quote
  for (const name of KNOWN_CHARACTERS) {
    if (beforeText.includes(name)) return name;
  }

  // Check for gender hints in surrounding text
  for (const hint of MALE_HINTS) {
    if (beforeText.includes(hint)) return hint;
  }
  for (const hint of FEMALE_HINTS) {
    if (beforeText.includes(hint)) return hint;
  }

  // Fall back to last known speaker
  if (lastSpeaker) return lastSpeaker;

  return "narrator";
}

/**
 * Get Azure voice name for a speaker
 */
function getVoiceForSpeaker(speaker: string): string {
  // Direct match
  if (VOICE_MAP[speaker]) return VOICE_MAP[speaker];

  // Gender-based fallback
  if (MALE_HINTS.some((h) => speaker.includes(h))) return VOICE_MAP.male_default;
  if (FEMALE_HINTS.some((h) => speaker.includes(h))) return VOICE_MAP.female_default;

  return VOICE_MAP.narrator;
}

/**
 * Build multi-voice SSML
 */
function buildMultiVoiceSsml(segments: TtsSegment[], rateStr: string): string {
  // Group consecutive segments with same voice to reduce SSML complexity
  const grouped: TtsSegment[] = [];
  for (const seg of segments) {
    if (grouped.length > 0 && grouped[grouped.length - 1].voice === seg.voice) {
      grouped[grouped.length - 1].text += seg.text;
    } else {
      grouped.push({ ...seg });
    }
  }

  const voiceSections = grouped
    .map((seg) => `  <voice name="${seg.voice}"><prosody rate="${rateStr}">${escapeXml(seg.text)}</prosody></voice>`)
    .join("\n");

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
${voiceSections}
</speak>`;
}

/** Clean text for TTS — remove symbols that get read aloud */
function cleanForTts(text: string): string {
  return text
    // Remove **bold** markers
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove *italic* markers
    .replace(/\*([^*]+)\*/g, "$1")
    // Remove option lines: > A) ... / A）...
    .replace(/^>\s*[A-Da-d][)）].*/gm, "")
    // Remove "或者，你也可以自由描述..." prompts
    .replace(/^>\s*或者.*/gm, "")
    // Remove bare > at line start
    .replace(/^>\s*/gm, "")
    // Remove 「」 quote marks (keep content)
    .replace(/[「」]/g, "")
    // Remove —— dash pairs → pause
    .replace(/——/g, "，")
    // Remove ...... → pause
    .replace(/…{2,}/g, "，")
    .replace(/\.{3,}/g, "，")
    // Remove stray * and #
    .replace(/[*#]/g, "")
    // Clean multiple commas/pauses
    .replace(/，{2,}/g, "，")
    // Clean multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
