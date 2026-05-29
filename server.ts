import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON parsing middleware with a larger limit to accommodate photo uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Lazy initializer for the Gemini Client to prevent crash on startup if missing API key
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set. Please supply it in the AI Studio Settings.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

/**
 * Automatically retry calls to Google GenAI to handle transient 503/UNAVAILABLE errors.
 */
async function generateContentWithRetry(ai: GoogleGenAI, params: any, maxRetries = 3): Promise<any> {
  let attempt = 0;
  let delay = 1000; // start with 1000ms delay
  while (true) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      attempt++;
      const errorMessage = error?.message ? String(error.message) : String(error);
      const isTransient = errorMessage.includes("503") || 
                          errorMessage.includes("demand") || 
                          errorMessage.includes("UNAVAILABLE") ||
                          errorMessage.includes("temporary") ||
                          error?.status === "UNAVAILABLE" ||
                          error?.status === 503 ||
                          (error?.status && error.status >= 500);
      
      if (isTransient && attempt < maxRetries) {
        console.warn(`[Gemini API] Got transient capacity/503 error on attempt ${attempt}. Retrying in ${delay}ms... Details: ${errorMessage.substring(0, 150)}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
        continue;
      }
      throw error;
    }
  }
}

/**
 * Parses Google GenAI SDK errors into clear, professional and helpful Chinese descriptions.
 */
function formatGeminiError(error: any): string {
  const msg = error?.message ? String(error.message) : String(error);
  
  // If the error message is serialised JSON from Google SDK, try to extract the inner message
  if (typeof msg === "string" && (msg.trim().startsWith("{") || msg.includes('"error"'))) {
    try {
      // Find the JSON-like part if it's wrapped
      let jsonStr = msg;
      const firstCurly = msg.indexOf("{");
      if (firstCurly !== -1) {
        jsonStr = msg.substring(firstCurly);
      }
      const parsed = JSON.parse(jsonStr);
      if (parsed?.error?.message) {
        let cleanMsg = parsed.error.message;
        if (cleanMsg.includes("experiences high demand") || cleanMsg.includes("high demand") || cleanMsg.includes("UNAVAILABLE") || cleanMsg.includes("503")) {
          return "AI 识别服务当前繁忙（503 负载过高），系统在自动重试数次后仍未成功，请稍等 5-10 秒后再次点击[重新识别]或[重新发起识别]按钮。";
        }
        return `AI 服务端返回异常: ${cleanMsg}`;
      }
    } catch (e) {
      // ignore parsing mismatch
    }
  }
  
  if (msg.includes("503") || msg.includes("demand") || msg.includes("UNAVAILABLE")) {
    return "AI 识别服务当前繁忙（503 负载过高），系统在自动重试数次后仍未成功，请稍等 5-10 秒后再次点击[重新识别]或[重新发起识别]按钮。";
  }
  
  return msg;
}

// Ensure the server can check health
app.get("/api/health", (req, res) => {
  const hasKey = !!process.env.GEMINI_API_KEY;
  res.json({ status: "ok", hasApiKey: hasKey });
});

/**
 * Endpoint to extract English words from a base64 encoded photo/image.
 */
app.post("/api/extract-words-photo", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) {
      res.status(400).json({ error: "Missing post parameter 'image' (base64)." });
      return;
    }

    const ai = getGeminiClient();
    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/jpeg",
        data: image,
      },
    };

    const promptText = "Please read the text or list in this image and extract all English words or phrases. Provide a clean list of words, along with an optional Chinese translation if visible or known. Return them structured strictly inside the requested JSON schema.";

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: [imagePart, { text: promptText }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: {
                type: Type.STRING,
                description: "The extracted English word or core phrase in lower case or standard spelling.",
              },
              translation: {
                type: Type.STRING,
                description: "Chinese description/translation seen in the picture, or the generic core translation.",
              },
            },
            required: ["word"],
          },
        },
      },
    });

    const parsedText = response.text;
    if (!parsedText) {
      res.status(500).json({ error: "No text returned from Gemini." });
      return;
    }

    const words = JSON.parse(parsedText);
    res.json({ success: true, words });
  } catch (error: any) {
    console.error("Error in /api/extract-words-photo:", error);
    res.status(500).json({ error: formatGeminiError(error) });
  }
});

/**
 * Endpoint to automatically enrich words with Phonetics, Chinese meanings, and interactive example sentences.
 */
app.post("/api/enrich-words", async (req, res) => {
  try {
    const { words } = req.body;
    if (!words || !Array.isArray(words) || words.length === 0) {
      res.status(400).json({ error: "Missing or invalid 'words' body parameter. Expected array of strings." });
      return;
    }

    if (words.length > 30) {
      res.status(400).json({ error: "Too many words. Please request enrichment at most 30 words per batch." });
      return;
    }

    const ai = getGeminiClient();
    const promptText = `For the following list of English words: [${words.join(", ")}], automatically generate:
1. Phonetic Symbol (音标 using modern international phonetic alphabet symbols).
2. Clean, concise, core Chinese translation (中文翻译).
3. A clear English example sentence demonstrating daily usage (英文例句). Make sure the sentence is not overly convoluted, making it great for dictation.
4. The Chinese translation of that example sentence (例句翻译).

Return the enriched word list in a strictly validated structured JSON array in the exact requested schema layout.`;

    const response = await generateContentWithRetry(ai, {
      model: "gemini-3.5-flash",
      contents: promptText,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              word: {
                type: Type.STRING,
                description: "The original matched English word in lowercase.",
              },
              phonetic: {
                type: Type.STRING,
                description: "Phonetic symbol (IPA DJ notation, bounded by forward slashes, e.g. /ɪɡˈzæmpl/ or /ˈæp.l̩/).",
              },
              translation: {
                type: Type.STRING,
                description: "Concise Chinese meaning/translation of the word.",
              },
              exampleEn: {
                type: Type.STRING,
                description: "A simple, illustrative English example sentence showing correct usage. Keeps it compact.",
              },
              exampleZh: {
                type: Type.STRING,
                description: "Detailed Chinese translation for the provided example sentence.",
              },
            },
            required: ["word", "phonetic", "translation", "exampleEn", "exampleZh"],
          },
        },
      },
    });

    const parsedText = response.text;
    if (!parsedText) {
      res.status(500).json({ error: "Empty response from Gemini." });
      return;
    }

    const enrichedResult = JSON.parse(parsedText);
    res.json({ success: true, data: enrichedResult });
  } catch (error: any) {
    console.error("Error in /api/enrich-words:", error);
    res.status(500).json({ error: formatGeminiError(error) });
  }
});

// Start our custom server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production builds
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Web App running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

startServer();
