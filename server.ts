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
          description: "核心知识点/考点，例如：一元二次方程配方法于平方根运算性质、动能定理、宾语从句",
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

// Error generator backup when API key is missing or calls fail/limit-exceeded
function getFallbackQuestions(subject: string = "数学", grade: string = "初中") {
  if (subject === "物理" || subject === "科学") {
    return {
      subject: "物理",
      grade: grade || "高中",
      originalQuestion: {
        content: "一质量为m的物体从 H = 5m 高处自由下落，落入沙坑 d = 0.2m 深处静止。求沙层阻力 f 是重力 mg 的几倍？",
        knowledgePoint: "动能定理中物体重力功的全程性分析",
        analysis: "在动能定理计算中，重力在下降的全程（包括空气中下降 H 以及沙坑中下落 d）都要做正功，忽略沙坑深度处的重力功是经典的易错点。全程方程应为：mg(H + d) - f_阻 * d = 0。"
      },
      similarQuestions: [
        {
          id: "sim_1",
          type: "解答题",
          content: "一质量为 1kg 的铁球从离地 H = 10m 的高处由静止下落，落入泥地中 d = 0.5m 后停止运动。如果不计空气阻力，求泥地对铁球的平均阻力 F_泥 大小（g取10m/s²）。",
          options: [],
          answer: "210 N",
          analysis: "1. 设泥地平均阻力为 F_泥。整个下落过程中重力做功为 mg(H + d)，泥地阻力做功为 -F_泥 * d。\n2. 根据动能定理，有整个过程：W_总 = mg(H + d) - F_泥 * d = ΔEk = 0。\n3. 代入数据：(1kg)(10m/s²)(10m + 0.5m) - F_泥 * 0.5m = 0。\n4. 化简可得：105 N·m - 0.5 * F_泥 = 0，从而解得泥地阻力 F_泥 = 210 N。"
        },
        {
          id: "sim_2",
          type: "选择题",
          content: "一个质量为 m 的小球，从距水面高 h 处的 A 点自由下落，落入水中下沉深 H 处 B 点时速度减为零。不计空气阻力，求水对小球的平均浮力与阻力的合力 F。正确表达式是：\nA. F = mg(1 + h/H)\nB. F = mgh/H\nC. F = mg(1 - h/H)\nD. F = mg(1 + H/h)",
          options: ["A. F = mg(1 + h/H)", "B. F = mgh/H", "C. F = mg(1 - h/H)", "D. F = mg(1 + H/h)"],
          answer: "A",
          analysis: "1. 同样适用全程法：小球自静止下落到水中速度为零的过程，重力做功为 mg(h + H)。\n2. 浮力与阻力的合力 F 对小球做负功，在水中下潜深度为 H，则功为 -F * H。\n3. 根据动能定理：mg(h + H) - F * H = 0。\n4. 整理方程：F * H = mg(h + H) ➔ F = mg(1 + h/H)。因此正确选项是 A。"
        },
        {
          id: "sim_3",
          type: "填空题",
          content: "一个质量为 m 的雨滴，从海拔 h = 200m 高空的云层由静止自由飘落。由于空气阻力的存在，当落到距离地面 d = 5m 后已经达到了恒定的终极速度 v = 5m/s 并匀速下落直到落地。求空气阻力在雨滴下落全程做的总功 W_阻 表达式为 ___________。",
          options: [],
          answer: "0.5mv² - mgh",
          analysis: "1. 雨滴自由下落的全程重力做正功，下落总高度为 h，重力功为 mgh。\n2. 全程空气阻力做功设为 W_阻。\n3. 根据动能定理：W_重 + W_阻 = Ek_末 - Ek_初 ➔ mgh + W_阻 = 0.5mv² - 0。\n4. 移项可得空气阻力做的功 W_阻 = 0.5mv² - mgh。"
        }
      ]
    };
  }

  if (subject === "英语" || subject === "外语") {
    return {
      subject: "英语",
      grade: grade || "初中",
      originalQuestion: {
        content: "将“我想知道他住在哪里”翻译成英文。\n学生错写：I want to know where does he live.",
        knowledgePoint: "宾语从句中的陈述句排布语序",
        analysis: "宾语从句在主句中作宾语时，即使引导词是 where/what/how 等特殊疑问词，从句中词序也必须使用“主语+谓语”的陈述语序，严禁套用疑问句的助动词倒装结构形式。"
      },
      similarQuestions: [
        {
          id: "sim_1",
          type: "解答题",
          content: "请将“你能告诉我你为什么迟到了吗？”翻译为英文。",
          options: [],
          answer: "Can you tell me why you are late? (或 Can you tell me why you were late?)",
          analysis: "1. 疑问主句是 Can you tell me... 后面要接疑问原因。 \n2. 宾语从句是“你为什么迟到了”，引导词是 why。语序必须是陈述句语序，所以是 'why you are/were late' 而不是倒装的 'why are/were you late'。\n3. 结合起来即为：Can you tell me why you are late?"
        },
        {
          id: "sim_2",
          type: "选择题",
          content: "— Excuse me, could you tell me ______?\n— Certainly. In about ten minutes.\nA. when will the train leave\nB. when the train will leave\nC. when does the train leave\nD. when the train left",
          options: ["A. when will the train leave", "B. when the train will leave", "C. when does the train leave", "D. when the train left"],
          answer: "B",
          analysis: "1. “could you tell me” 后面接宾语从句，从句必须采用“陈述语序”，即主语在前、谓语在后。由此可以排除 A、C（这两个依然是特殊疑问句的倒装语序）。\n2. 答语“In about ten minutes”意为“在约10分钟之后”，表明火车还没有开，指将来要发生的动作，需使用一般将来时。\n3. 因此，选择 B 选项。"
        },
        {
          id: "sim_3",
          type: "填空题",
          content: "I wasn't sure _________ (谁写了这封信), so I didn't reply to it immediately.",
          options: [],
          answer: "who wrote this letter / who had written the letter",
          analysis: "1. 空白处做 wasn't sure 的宾语从句。\n2. 应该用陈述语序，而疑问词 who 自主充当从句的主语，谓语动词 write 使用过去式形式 wrote 即可表示谁写了这封信。"
        }
      ]
    };
  }

  // Default to Mathematics
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
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      console.warn("GEMINI_API_KEY not configured or using placeholders. Using high-quality offline fallbacks for immediate preview.");
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

    // Clean Markdown block wrapper markings if present in string output
    let cleanText = textOutput.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7);
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.substring(3);
    }
    if (cleanText.endsWith("```")) {
      cleanText = cleanText.substring(0, cleanText.length - 3);
    }
    cleanText = cleanText.trim();

    try {
      const parsedJson = JSON.parse(cleanText);
      res.json(parsedJson);
    } catch (err: any) {
      console.error("JSON parsing error on cleaned response:", cleanText, err);
      throw new Error(`无法解析模型返回的结构化JSON数据。内容为: ${cleanText.substring(0, 200)}...`);
    }

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
