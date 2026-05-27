export interface SampleProblem {
  id: string;
  name: string;
  subject: string;
  grade: string;
  questionText: string;
  mistakeText: string;
  redCorrection: string;
  knowledgePoint: string;
}

export const SAMPLE_PROBLEMS: SampleProblem[] = [
  {
    id: "sample_math",
    name: "例：初中数学 - 一元二次方程",
    subject: "数学",
    grade: "初中",
    questionText: "解方程：x² - 2x - 3 = 0",
    mistakeText: "解：移项得，x² - 2x = 3\n两边配方得：x² - 2x + 1 = 4\n所以 (x - 1)² = 4\n直接开平方得：x - 1 = 2\n解得：x = 3",
    redCorrection: "漏掉了负数根的情况！\nx - 1 = ±2",
    knowledgePoint: "一元二次方程配方法与平方根运算性质"
  },
  {
    id: "sample_physics",
    name: "例：高中物理 - 动能定理与重力功",
    subject: "物理",
    grade: "高中",
    questionText: "一质量为m的物体从 H = 5m 高处自由下落，落入沙坑 d = 0.2m 深处静止。求沙层阻力 f 是重力 mg 的几倍？",
    mistakeText: "解：由动能定理，重力做功 mgH，阻力做功 -fd\n则：mgH - fd = 0\n得：f / mg = H / d\n系数倍数 = 5 / 0.2 = 25 倍",
    redCorrection: "重力加速度在下降全程都做功！\n应该为 mg(H + d) - fd = 0。\n漏掉了沙坑深度d之内的重力功！",
    knowledgePoint: "动能定理中物体重力功的全程性分析"
  },
  {
    id: "sample_english",
    name: "例：初中英语 - 宾语从句语序",
    subject: "英语",
    grade: "初中",
    questionText: "将“我想知道他住在哪里”翻译成英文。",
    mistakeText: "Translation:\nI want to know where does he live.",
    redCorrection: "宾语从句在主句中作宾语，\n必须使用陈述句语序！\n应改为: where he lives",
    knowledgePoint: "宾语从句中的陈述句排布语序"
  }
];

/**
 * Dynamically draws the mistake on a paper canvas and returns dataURL image.
 */
export function generateSampleImage(sample: SampleProblem): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Draw elegant homework crumpled-paper colored background
  ctx.fillStyle = "#fafaf9"; // stone 50
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Draw notebook blue horizontal lines (for classic homework style)
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  const lineSpacing = 28;
  for (let y = lineSpacing * 1.5; y < canvas.height; y += lineSpacing) {
    ctx.beginPath();
    ctx.moveTo(30, y);
    ctx.lineTo(canvas.width - 30, y);
    ctx.stroke();
  }

  // 3. Draw red left vertical margin line
  ctx.strokeStyle = "#fecaca";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(70, 0);
  ctx.lineTo(70, canvas.height);
  ctx.stroke();

  // 4. Draw Header / Info (Simulating student handwriting)
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 16px 'Inter', sans-serif";
  ctx.fillText(`【错题本记录】 ${sample.subject} - ${sample.grade}`, 80, 32);

  // 5. Draw question statement (blue-black pen representation)
  ctx.fillStyle = "#0f172a";
  ctx.font = "italic 14px 'Inter', sans-serif";
  ctx.fillText("题目：", 80, 68);
  ctx.fillText(sample.questionText, 125, 68);

  // 6. Draw handwritten mistake content
  ctx.fillStyle = "#1e3a8a"; // dark blue ballpoint pen
  ctx.font = "14px 'Inter', monospace";
  const mistakeLines = sample.mistakeText.split("\n");
  mistakeLines.forEach((line, index) => {
    ctx.fillText(line, 80, 110 + index * 26);
  });

  // 7. Draw Teachers Correction (Red chalk markings & circle)
  // Draw red ✗ and circle around the error
  ctx.strokeStyle = "#ef4444"; // red pen
  ctx.lineWidth = 2.5;
  
  // Draw red circle around the last wrong step area
  ctx.beginPath();
  ctx.ellipse(220, 200, 130, 25, Math.PI / 36, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw teacher's ✗
  ctx.font = "bold 28px 'Inter', sans-serif";
  ctx.fillStyle = "#ef4444";
  ctx.fillText("✗", 40, 180);

  // Teach correction feedback text bubble
  ctx.fillStyle = "#ef4444";
  ctx.font = "bold 12px 'Inter', sans-serif";
  ctx.fillText("批改意见: ", 380, 130);
  
  ctx.font = "12px 'Inter', sans-serif";
  const correctionLines = sample.redCorrection.split("\n");
  correctionLines.forEach((line, idx) => {
    ctx.fillText(line, 380, 152 + idx * 22);
  });

  // Draw some doodle highlights for a truly authentic teacher marking feel
  ctx.strokeStyle = "#fca5a5";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(375, 115);
  ctx.lineTo(570, 115);
  ctx.lineTo(570, 260);
  ctx.lineTo(375, 260);
  ctx.closePath();
  ctx.stroke();

  return canvas.toDataURL("image/png");
}
