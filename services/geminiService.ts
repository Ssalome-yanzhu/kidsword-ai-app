import axios from "axios";
import { SentenceResult, Recommendation } from "../types";

// 从环境变量读取密钥
const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;
const SILICON_API_KEY = import.meta.env.VITE_SILICON_API_KEY;

// DeepSeek API 配置
const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

// 通用 API 调用函数（DeepSeek）
async function callDeepSeek(prompt: string, schema?: any) {
  const response = await axios.post(
    DEEPSEEK_API_URL,
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      response_format: schema ? { type: "json_object" } : undefined,
    },
    {
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  
  let content = response.data.choices[0].message.content;
  
  // 如果要求 JSON 格式，尝试解析
  if (schema) {
    try {
      // 方法1: 匹配 JSON 数组或对象
      const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      // 清理可能的尾随逗号
      content = content.replace(/,\s*}/g, '}').replace(/,\s*\]/g, ']');
      return JSON.parse(content);
    } catch (e) {
      console.error("JSON parse error:", content);
      // 如果解析失败，尝试手动构造
      if (content.includes('"word"') && content.includes('"translation"')) {
        // 提取每一行，手动构建数组
        const lines = content.split('\n');
        const items = [];
        let currentItem: any = {};
        for (const line of lines) {
          if (line.includes('"word"')) {
            currentItem.word = line.match(/"word":\s*"([^"]+)"/)?.[1] || '';
          } else if (line.includes('"translation"')) {
            currentItem.translation = line.match(/"translation":\s*"([^"]+)"/)?.[1] || '';
          } else if (line.includes('"reason"')) {
            currentItem.reason = line.match(/"reason":\s*"([^"]+)"/)?.[1] || '';
            if (currentItem.word && currentItem.translation && currentItem.reason) {
              items.push({...currentItem});
              currentItem = {};
            }
          }
        }
        if (items.length > 0) return items;
      }
      throw e;
    }
  }
  
  return content;
}

// 生成句子（使用 DeepSeek）
export const generateSentence = async (words: string[]): Promise<SentenceResult> => {
  const prompt = `Create a simple, very short, fun English sentence for an 8-year-old child using these words: ${words.join(', ')}. 
  The sentence should be grammatically correct and usable in a very common daily life scenario.
  Return ONLY a JSON object in this exact format:
  {
    "sentence": "English sentence (max 10 words)",
    "translation": "Chinese translation",
    "context": "A very short description of the visual context (in English)"
  }`;

  return await callDeepSeek(prompt, true);
};

// 获取推荐单词（使用 DeepSeek）
export const getRecommendations = async (existingWords: string[]): Promise<Recommendation[]> => {
  const prompt = `Based on this list of English words an 8-year-old child already knows: [${existingWords.join(', ')}], 
  suggest 4 NEW, simple English words that would be natural next steps for them to learn.
  The suggestions should be common nouns, verbs, or adjectives used in daily life.
  Return ONLY a JSON array in this exact format:
  [
    {"word": "apple", "translation": "苹果", "reason": "Reason in Chinese"},
    {"word": "run", "translation": "跑", "reason": "Reason in Chinese"}
  ]`;

  return await callDeepSeek(prompt, true);
};

/** 硅基流动文档中的 Qwen-Image-Edit-2509 为图生图，需提供参考图；使用固定中性底图作为可编辑起点 */
const QWEN_IMAGE_EDIT_MODEL = "Qwen/Qwen-Image-Edit-2509";
const NEUTRAL_BASE_IMAGE =
  "https://dummyimage.com/1328x1328/e8e8e8/e8e8e8.png";

// 生成图片（硅基流动 Qwen/Qwen-Image-Edit-2509，按 prompt 生成场景）
export const generateVisual = async (scenario: string, sentence: string): Promise<string | undefined> => {
  if (!SILICON_API_KEY) {
    console.error("Missing VITE_SILICON_API_KEY; cannot call image API.");
    return undefined;
  }

  const prompt = `Pixar style, 3D render, cute and colorful scene. ${scenario}. The scene matches the sentence "${sentence}". Bright lighting, high detail, kid-friendly, no text or watermark.`;

  try {
    const response = await axios.post(
      "https://api.siliconflow.cn/v1/images/generations",
      {
        model: QWEN_IMAGE_EDIT_MODEL,
        prompt,
        num_inference_steps: 25,
        cfg: 4,
        image: NEUTRAL_BASE_IMAGE,
        image2: NEUTRAL_BASE_IMAGE,
        image3: NEUTRAL_BASE_IMAGE,
      },
      {
        headers: {
          Authorization: `Bearer ${SILICON_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 120000,
      }
    );

    if (response.data.images?.[0]) {
      const image = response.data.images[0];
      const imageUrl = image.url || image.image_url;
      if (imageUrl && typeof imageUrl === "string") {
        return imageUrl;
      }
    }

    if (response.data.data?.[0]?.url) {
      return response.data.data[0].url;
    }

    if (response.data.output?.[0]) {
      return response.data.output[0];
    }

    if (response.data.image || response.data.base64) {
      const base64Image = response.data.image || response.data.base64;
      if (typeof base64Image === "string") {
        return base64Image.startsWith("data:image")
          ? base64Image
          : `data:image/png;base64,${base64Image}`;
      }
    }

    console.warn("Unexpected image API response:", response.data);
  } catch (error: unknown) {
    const err = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error("Qwen-Image-Edit request failed");
    if (err.response) {
      console.error(`  Status: ${err.response.status}`, err.response.data);
    } else {
      console.error(`  Error: ${err.message}`);
    }
  }

  const encodedPrompt = encodeURIComponent(prompt.substring(0, 100));
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;
};

// 语音生成（使用浏览器 Web Speech API）
export const generateSpeech = async (text: string): Promise<Uint8Array | undefined> => {
  // 浏览器语音合成，返回空数组表示成功（实际播放在组件里处理）
  return new Uint8Array();
};

// 播放语音的辅助函数（在组件中调用）
export const speakText = (text: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.pitch = 1.1;
    
    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
    
    window.speechSynthesis.speak(utterance);
  });
};

// 保留原有函数签名兼容性
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  // 备用实现，实际不使用
  const buffer = ctx.createBuffer(numChannels, 1, sampleRate);
  return buffer;
}