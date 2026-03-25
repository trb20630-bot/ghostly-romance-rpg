import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ===== Voice Map =====
const VOICE_MAP: Record<string, string> = {
  // Narration — 溫暖沉穩的說書人
  narrator: "zh-CN-YunyangNeural",
  // Male characters
  寧采臣: "zh-CN-YunxiNeural",       // 年輕書生
  燕赤霞: "zh-CN-YunjianNeural",      // 滄桑有力的道士
  // Female characters
  聶小倩: "zh-CN-XiaoyiNeural",       // 溫柔女聲（比 Xiaoxiao 更柔和）
  小倩: "zh-CN-XiaoyiNeural",
  姥姥: "zh-CN-XiaochenNeural",       // 陰沉女聲
  // Defaults
  male_default: "zh-CN-YunjianNeural",
  female_default: "zh-CN-XiaoyiNeural",
};

// Per-character prosody settings
const PROSODY_MAP: Record<string, { rate: string; pitch: string }> = {
  "zh-CN-YunyangNeural":  { rate: "+10%",  pitch: "+0Hz"  },  // 旁白：稍快
  "zh-CN-YunxiNeural":    { rate: "+5%",   pitch: "+0Hz"  },  // 寧采臣：略快
  "zh-CN-YunjianNeural":  { rate: "-5%",   pitch: "-1Hz"  },  // 燕赤霞：沉穩慢速
  "zh-CN-XiaoyiNeural":   { rate: "+0%",   pitch: "+1Hz"  },  // 聶小倩：柔和
  "zh-CN-XiaochenNeural": { rate: "-10%",  pitch: "-3Hz"  },  // 姥姥：陰森慢速
};

const DEFAULT_PROSODY = { rate: "+10%", pitch: "+0Hz" };

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
 * body: { text, mode?: "smart"|"single", voice?: string }
 * mode=smart: multi-voice with character detection + per-character prosody (default)
 * mode=single: single voice
 */
export async function POST(request: NextRequest) {
  try {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION || "eastasia";

    if (!key) {
      return NextResponse.json({ error: "AZURE_SPEECH_KEY not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { text, mode = "smart", voice = "narrator" } = body;

    if (!text?.trim()) {
      return NextResponse.json({ error: "缺少文字內容" }, { status: 400 });
    }

    let ssml: string;

    if (mode === "smart") {
      // Smart mode: preserve 「」 and 【】 for voice detection, then parse segments
      const cleaned = cleanForTts(text.slice(0, 10000), true);
      const segments = parseSegments(cleaned);
      ssml = buildMultiVoiceSsml(segments);
    } else {
      // Single voice mode
      const cleaned = cleanForTts(text.slice(0, 10000), false);
      const voiceName = VOICE_MAP[voice] || VOICE_MAP.narrator;
      const prosody = PROSODY_MAP[voiceName] || DEFAULT_PROSODY;
      ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${voiceName}">
    <prosody rate="${prosody.rate}" pitch="${prosody.pitch}">${escapeXml(cleaned)}</prosody>
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
 * Parse text into voice segments.
 * Priority: 【角色名】「台詞」 markers (new format) → fallback to 「」 heuristic (old format)
 */
function parseSegments(text: string): TtsSegment[] {
  // Check if text uses 【角色名】 markers
  if (/【[^】]+】/.test(text)) {
    return parseMarkedSegments(text);
  }
  // Fallback: old 「」 heuristic for saves without markers
  return parseLegacySegments(text);
}

/**
 * New format: 【角色名】「台詞」 — reliable character voice mapping
 */
function parseMarkedSegments(text: string): TtsSegment[] {
  const segments: TtsSegment[] = [];
  // Split on 【角色名】 markers, capturing the character name
  const parts = text.split(/(【[^】]+】)/g);

  let currentSpeaker = "";

  for (const part of parts) {
    if (!part.trim()) continue;

    const markerMatch = part.match(/^【([^】]+)】$/);
    if (markerMatch) {
      // This is a character marker — set speaker for next segment
      currentSpeaker = markerMatch[1].trim();
      continue;
    }

    if (currentSpeaker) {
      // Text after a character marker → character voice
      // Strip 「」 quotes if present for cleaner TTS
      const cleaned = part.replace(/^「/, "").replace(/」$/, "").trim();
      if (cleaned) {
        segments.push({ voice: getVoiceForSpeaker(currentSpeaker), text: cleaned });
      }
      currentSpeaker = "";
    } else {
      // No marker before this text → narration
      // But check for inline 「」 with nearby character names (mixed format)
      segments.push({ voice: VOICE_MAP.narrator, text: part });
    }
  }

  return segments;
}

/**
 * Legacy format: detect speaker from context around 「」 quotes
 */
function parseLegacySegments(text: string): TtsSegment[] {
  const segments: TtsSegment[] = [];
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
  const beforeText = fullText.slice(Math.max(0, quoteIdx - 40), quoteIdx);

  for (const name of KNOWN_CHARACTERS) {
    if (beforeText.includes(name)) return name;
  }
  for (const hint of MALE_HINTS) {
    if (beforeText.includes(hint)) return hint;
  }
  for (const hint of FEMALE_HINTS) {
    if (beforeText.includes(hint)) return hint;
  }

  if (lastSpeaker) return lastSpeaker;
  return "narrator";
}

/**
 * Get Azure voice name for a speaker
 */
function getVoiceForSpeaker(speaker: string): string {
  if (VOICE_MAP[speaker]) return VOICE_MAP[speaker];
  if (MALE_HINTS.some((h) => speaker.includes(h))) return VOICE_MAP.male_default;
  if (FEMALE_HINTS.some((h) => speaker.includes(h))) return VOICE_MAP.female_default;
  return VOICE_MAP.narrator;
}

/**
 * Build multi-voice SSML with per-character prosody
 */
function buildMultiVoiceSsml(segments: TtsSegment[]): string {
  // Group consecutive segments with same voice
  const grouped: TtsSegment[] = [];
  for (const seg of segments) {
    if (grouped.length > 0 && grouped[grouped.length - 1].voice === seg.voice) {
      grouped[grouped.length - 1].text += seg.text;
    } else {
      grouped.push({ ...seg });
    }
  }

  const voiceSections = grouped
    .map((seg) => {
      const prosody = PROSODY_MAP[seg.voice] || DEFAULT_PROSODY;
      return `  <voice name="${seg.voice}"><prosody rate="${prosody.rate}" pitch="${prosody.pitch}">${escapeXml(seg.text)}</prosody></voice>`;
    })
    .join("\n");

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
${voiceSections}
</speak>`;
}

/**
 * Clean text for TTS — remove symbols that get read aloud
 * @param preserveQuotes - true in smart mode to keep 「」 for voice detection
 */
function cleanForTts(text: string, preserveQuotes: boolean): string {
  let cleaned = text
    // Remove markdown bold/italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    // Remove option lines: A) ... / A. ... / A）...
    .replace(/^[A-Da-d][)）.]\s*.*/gm, "")
    // Remove 【你的選擇】 block header
    .replace(/^【.*選擇.*】.*$/gm, "")
    // Remove "或者..." prompts
    .replace(/^>\s*或者.*/gm, "")
    .replace(/^>\s*/gm, "")
    // Remove scene tags
    .replace(/<!--\s*SCENE:\s*\w+\s*-->/g, "")
    // Remove --- dividers
    .replace(/^-{3,}$/gm, "")
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

  if (!preserveQuotes) {
    cleaned = cleaned.replace(/[「」]/g, "");
  }

  return cleaned;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
