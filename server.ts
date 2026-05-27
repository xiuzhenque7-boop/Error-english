import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase request size limit to support base64 image uploads
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Lazy initializer for Google GenAI to avoid startup crashes if key is omitted
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required. Please set it in AI Studio Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Structured JSON schema for mistake analysis and practice generation
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description: "学科，例如：数学, 物理, 化学, 英语, 语文, 生物",
    },
    grade: {
      type: Type.STRING,
      description: "适用年级阶段，例如：小学, 初中, 高中",
    },
    originalQuestion: {
      type: Type.OBJECT,
      properties: {
        content: {
          type: Type.STRING,
          description: "提取出的原错题文字内容（如果是选择题，包含选项）",
        },
        knowledgePoint: {
          type: Type.STRING,
          description: "核心知识点/考点，例如：一元二次方程求根公式、动能定理、宾语从句",
        },
        analysis: {
          type: Type.STRING,
          description: "对原题考点、解题思路和易错点的简要分析与评点",
        },
      },
      required: ["content", "knowledgePoint", "analysis"],
    },
    similarQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: {
            type: Type.STRING,
            description: "练习题唯一ID，例如 sim_1, sim_2, sim_3",
          },
          type: {
            type: Type.STRING,
            description: "题型，例如：选择题, 填空题, 解答题",
          },
          content: {
            type: Type.STRING,
            description: "相似题目的详细题干内容。如果是选择题，必须在此写明题干以及ABCD选项。",
          },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: "如果是选择题，提供4个选项。如 ['A. ...', 'B. ...', 'C. ...', 'D. ...']；否则为空数组",
          },
          answer: {
            type: Type.STRING,
            description: "本题的正确答案或解答结果",
          },
          analysis: {
            type: Type.STRING,
            description: "详细解答步骤、解题思路与技巧深度剖析",
          },
        },
        required: ["id", "type", "content", "answer", "analysis"],
      },
      description: "严格符合原题考点与难度的3道举一反三相似练习题",
    },
  },
  required: ["subject", "grade", "originalQuestion", "similarQuestions"],
};

// Error generator backup when API key is missing or calls fail
function getFallbackQuestions(subject: string = "数学", grade: string = "初中") {
  return {
    subject,
    grade,
    originalQuestion: {
      content: "已知一元二次方程 x^2 - 4x + m = 0 有两个不相等的实数根，求实数 m 的取值范围。",
      knowledgePoint: "一元二次方程根的判别式",
      analysis: "本题考察一元二次方程根的判别式 Δ = b^2 - 4ac。方程有两个不相等的实根，说明判别式必须严格大于0。易错点是判定符号方向，或者把大于等于与大于混淆。"
    },
    similarQuestions: [
      {
        id: "sim_1",
        type: "解答题",
        content: "已知一元二次方程 x^2 - 6x + k + 1 = 0 有两个不相等的实数根，求常数 k 的取值范围。",
        options: [],
        answer: "k < 8",
        analysis: "1. 方程有两个不相等的实数根，所以判别式 Δ = (-6)^2 - 4(1)(k + 1) > 0。\n2. 化简得：36 - 4k - 4 > 0。\n3. 即 32 - 4k > 0，移项得 4k < 32。\n4. 解得 k < 8。"
      },
      {
        id: "sim_2",
        type: "选择题",
        content: "若关于 x 的方程 x^2 + 2x - p = 0 有两个不相等的实数根，则实数 p 的取值范围是：\nA. p > -1\nB. p < -1\nC. p ≥ -1\nD. p ≤ -1",
        options: ["A. p > -1", "B. p < -1", "C. p ≥ -1", "D. p ≤ -1"],
        answer: "A",
        analysis: "1. 判别式 Δ = 2^2 - 4(1)(-p) = 4 + 4p。\n2. 令 Δ > 0，即 4 + 4p > 0。\n3. 解得 p > -1。因此选择 A 选项。"
      },
      {
        id: "sim_3",
        type: "填空题",
        content: "若一元二次方程 2x^2 + 4x + c = 0 没有实数根，则常数 c 的取值范围是 _________。",
        options: [],
        answer: "c > 2",
        analysis: "1. 方程没有实数根，等价于判别式小于0。\n2. Δ = 4^2 - 4(2)(c) = 16 - 8c < 0。\n3. 移项得 8c > 16，解得 c > 2。"
      }
    ]
  };
}

// API endpoint for error question analysis & analogous exercise generation
app.post("/api/generate-questions", async (req, res) => {
  try {
    const { image, subject, grade } = req.body;

    if (!image) {
      return res.status(400).json({ error: "请提供上传的错题图片" });
    }

    // Process image base64
    let base64Data = image;
    let mimeType = "image/png";

    if (image.startsWith("data:")) {
      const parts = image.split(",");
      const meta = parts[0];
      base64Data = parts[1];
      const mimeMatch = meta.match(/data:([^;]+);/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }
    }

    // Safety check check key
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      console.warn("GEMINI_API_KEY not configured. Using high-quality offline fallbacks for immediate preview.");
      // Provide custom mock data based on subject filter if provided
      return res.json(getFallbackQuestions(subject || "数学", grade || "初中"));
    }

    const ai = getGeminiClient();

    const imagePart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    const promptText = `
你是一位资深的中小学各科智能化教学与题库研发专家。请仔细识别、分析并提取上传的错题图片内容，然后完成以下工作：

1. 精确分析本题：
   - 提取包含的完整题目题干文本（如果是选择题，请完整列出所有选项）。
   - 识别本题属于哪个学科（例如数学、物理、化学、英语等）和适用学段。
   - 准确诊断核心知识点（考点），并提供简要易懂、切中要害的错因分析与思路点拨。

2. 生成 3 道跟本题「考点一致、难度相当、题型匹配」的举一反三相似练习题：
   - 必须更换题干情境、数字或文本，严禁直接复制或拼凑。
   - 相似题目的题型应该匹配原题。如果原题是选择题，生成的题目也更建议为选择题（并给出4个选项）。
   - 每道生成的题目必须包含：题型、详细题干内容、正确答案、详尽系统的题目解析。
   - ${subject ? `优先倾斜于用户指定的 "${subject}" 学科领域规律。` : ""}
   - ${grade ? `优先倾斜于用户指定的 "${grade}" 阶段。` : ""}

请严格返回符合 JSON 模式的数据包：
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          imagePart,
          { text: promptText }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.7,
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Gemini returned empty text response");
    }

    const parsedJson = JSON.parse(textOutput.trim());
    res.json(parsedJson);

  } catch (error: any) {
    console.error("Error analyzing image and generating questions:", error);
    res.status(500).json({
      error: "智能化生成出错，请重试。",
      details: error.message || error
    });
  }
});

// Serve frontend SPA
const startServer = async () => {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode: Use Vite Dev Server Middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Serve Static Bundled Files
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Full-Stack Server] running on http://localhost:${PORT}`);
  });
};

startServer().catch((err) => {
  console.error("Failed to start full-stack server:", err);
});
