import { useState, useEffect, useRef, ChangeEvent, DragEvent, MouseEvent } from "react";
import {
  BookOpen,
  Upload,
  RefreshCw,
  Plus,
  Check,
  CheckCircle2,
  Bookmark,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
  FileText,
  Search,
  Image as ImageIcon,
  AlertCircle,
  Filter,
  Clock,
  ArrowRight,
  BookMarked,
  HelpCircle,
  RotateCcw
} from "lucide-react";
import { SAMPLE_PROBLEMS, generateSampleImage, SampleProblem } from "./utils/samples";
import { QuestionItem, OriginalQuestion, AnalogyResult, MistakeRecord } from "./types";

export default function App() {
  // Current active viewport tab: 'generate' | 'mistake-book'
  const [activeTab, setActiveTab] = useState<"generate" | "mistake-book">("generate");

  // Input states
  const [selectedSubject, setSelectedSubject] = useState<string>("数学");
  const [selectedGrade, setSelectedGrade] = useState<string>("初中");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generation status states
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analogyResult, setAnalogyResult] = useState<AnalogyResult | null>(null);
  const [hasSavedCurrent, setHasSavedCurrent] = useState<boolean>(false);

  // Solution disclosure triggers for generated questions
  // key of map: question index (e.g., "0", "1", "2")
  const [revealedSolutions, setRevealedSolutions] = useState<Record<string, boolean>>({});

  // Mistake Scrapbook collection state (initialized from localStorage)
  const [mistakeBook, setMistakeBook] = useState<MistakeRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterSubject, setFilterSubject] = useState<string>("全部");

  // Selected scrapbook item details view (modal or slider)
  const [selectedBookItem, setSelectedBookItem] = useState<MistakeRecord | null>(null);
  const [revealedSavedSolutions, setRevealedSavedSolutions] = useState<Record<string, boolean>>({});

  // Form custom text manual override (in case the OCR fails or user wants to paste direct text)
  const [isManualInput, setIsManualInput] = useState<boolean>(false);
  const [manualText, setManualText] = useState<string>("");

  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Automatically dismiss toast notifications
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load mistake book on initial mount
  useEffect(() => {
    const saved = localStorage.getItem("aistudio_mistake_book");
    if (saved) {
      try {
        setMistakeBook(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse mistake book from localStorage", e);
      }
    }
  }, []);

  // Show a default sample on first load
  useEffect(() => {
    handleSelectSample(SAMPLE_PROBLEMS[0]);
  }, []);

  const triggerToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  };

  // Switch to preset sample
  const handleSelectSample = (sample: SampleProblem) => {
    setSelectedSampleId(sample.id);
    setSelectedSubject(sample.subject);
    setSelectedGrade(sample.grade);
    const simulatedImage = generateSampleImage(sample);
    setUploadedImage(simulatedImage);
    setIsManualInput(false);
    setManualText("");
    // Clear old result to avoid confusion
    setAnalogyResult(null);
    setHasSavedCurrent(false);
    setRevealedSolutions({});
  };

  // Handle local file uploads
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      triggerToast("请选择有效的图片文件", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setUploadedImage(reader.result);
        setSelectedSampleId(null); // Clear active preset tag since client uploaded their own
        setAnalogyResult(null); // Reset layout to enable generating
        setHasSavedCurrent(false);
        setRevealedSolutions({});
        setIsManualInput(false);
        triggerToast("照片上传成功，可点击下方生成练习题", "success");
      }
    };
    reader.onerror = () => {
      triggerToast("解析图片失败，请换张图重试", "error");
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop handlers
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processImageFile(file);
    }
  };

  // Perform AI generation
  const handleGenerateQuestions = async () => {
    let payloadImage = uploadedImage;

    // Use simulated image or generate a fallback if none uploaded
    if (!payloadImage) {
      if (isManualInput && manualText.trim()) {
        // Create an empty canvas with user text as image placeholder if manual is used
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 100;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fafaf9";
          ctx.fillRect(0, 0, 400, 100);
          ctx.fillStyle = "#1e293b";
          ctx.font = "14px 'Inter', sans-serif";
          ctx.fillText("手动补充: " + manualText.slice(0, 20), 20, 50);
          payloadImage = canvas.toDataURL("image/png");
        }
      } else {
        triggerToast("请先上传错题图片或导入右侧高品质真题样例", "info");
        return;
      }
    }

    setLoading(true);
    setErrorMsg(null);
    setRevealedSolutions({});

    try {
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: payloadImage,
          subject: selectedSubject,
          grade: selectedGrade,
          manualText: isManualInput ? manualText : undefined,
        }),
      });

      if (!response.ok) {
        let errStr = `服务生成失败，状态码: ${response.status}`;
        try {
          const errPayload = await response.json();
          if (errPayload && (errPayload.error || errPayload.details)) {
            errStr = `${errPayload.error || "生成错误"} - ${errPayload.details || ""}`;
          }
        } catch (_) {}
        throw new Error(errStr);
      }

      const data: AnalogyResult = await response.json();
      setAnalogyResult(data);
      setHasSavedCurrent(false);
      triggerToast("真题考点诊断完毕！3道关联相似练已智能出炉", "success");
    } catch (err: any) {
      console.error("Generation error:", err);
      setErrorMsg(err.message || "连接服务器生成超时，请检查您的网络连接并重试。");
      triggerToast("生成失败，请重试", "error");
    } finally {
      setLoading(false);
    }
  };

  // Re-generate analogous questions
  const handleReGenerate = () => {
    handleGenerateQuestions();
  };

  // Save current error and its questions to mistake database (Local Storage)
  const handleSaveToBook = () => {
    if (!analogyResult) return;

    // Generate a beautiful title using core knowledge point or date
    const kp = analogyResult.originalQuestion.knowledgePoint || "未命名考点";
    const dateStr = new Date().toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    
    const newRecord: MistakeRecord = {
      id: "mistake_" + Date.now(),
      createdAt: new Date().toISOString(),
      title: `${analogyResult.subject}·${kp} 特训`,
      image: uploadedImage || undefined,
      subject: analogyResult.subject || selectedSubject,
      grade: analogyResult.grade || selectedGrade,
      originalQuestion: analogyResult.originalQuestion,
      similarQuestions: analogyResult.similarQuestions,
    };

    const updatedBook = [newRecord, ...mistakeBook];
    setMistakeBook(updatedBook);
    localStorage.setItem("aistudio_mistake_book", JSON.stringify(updatedBook));
    setHasSavedCurrent(true);
    triggerToast("成功保存至『错题本』！双重巩固可随时查看", "success");
  };

  // Delete a mistake record from ledger
  const handleDeleteRecord = (id: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("确定要删除这道错题记录吗？此操作无法撤销。")) return;

    const updatedBook = mistakeBook.filter((item) => item.id !== id);
    setMistakeBook(updatedBook);
    localStorage.setItem("aistudio_mistake_book", JSON.stringify(updatedBook));
    triggerToast("记录已彻底清空", "info");

    if (selectedBookItem && selectedBookItem.id === id) {
      setSelectedBookItem(null);
    }
  };

  // Clear entire database
  const handleClearAll = () => {
    if (!window.confirm("危险操作：确定要彻底清空你的个人错题本库吗？")) return;
    setMistakeBook([]);
    localStorage.removeItem("aistudio_mistake_book");
    triggerToast("错题本已全部清空", "info");
    setSelectedBookItem(null);
  };

  // Toggle dynamic fold for solutions inside generated list
  const toggleSolution = (index: string) => {
    setRevealedSolutions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Toggle fold for solutions inside saved items viewer
  const toggleSavedSolution = (index: string) => {
    setRevealedSavedSolutions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Filters for My Mistake Book
  const filteredBook = mistakeBook.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.originalQuestion.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.originalQuestion.knowledgePoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.originalQuestion.analysis.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSubject = filterSubject === "全部" || item.subject === filterSubject;

    return matchesSearch && matchesSubject;
  });

  const subjectsList = ["数学", "物理", "化学", "英语", "语文", "生物"];
  const gradesList = ["小学", "初中", "高中"];

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans flex flex-col antialiased">
      {/* Toast Notification HUD */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-bounce shadow-xl flex items-center space-x-2 px-5 py-3 rounded-xl backdrop-blur-md transition-all border border-green-200/50 bg-green-50 text-green-800">
          <BookMarked className="w-5 h-5 text-green-600 shrink-0" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Modern High-End Top Navigation Deck */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Logo Brand with Educational theme aesthetics */}
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600 rounded-xl leading-none shadow-md shadow-indigo-100 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <h1 id="app-title-main" className="text-xl font-bold tracking-tight text-stone-900 flex items-center gap-1.5">
                错题智学 · 举一反三系统
              </h1>
              <p className="text-xs text-stone-500 font-normal">
                上传错题照片 · 深度研判弱点考点 · 智能出具3道专属对照特训题
              </p>
            </div>
          </div>

          {/* Sleek Segment Switcher */}
          <div className="flex items-center space-x-1.5 bg-stone-100 p-1 rounded-xl">
            <button
              id="tab-click-generator"
              onClick={() => setActiveTab("generate")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                activeTab === "generate"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span>智能识别生成</span>
            </button>
            <button
              id="tab-click-notebook"
              onClick={() => setActiveTab("mistake-book")}
              className={`flex items-center space-x-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all relative ${
                activeTab === "mistake-book"
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <BookOpen className="w-4 h-4 text-amber-500" />
              <span>错题本</span>
              {mistakeBook.length > 0 && (
                <span className="absolute -top-1 right-0 select-none bg-red-500 text-white font-mono text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-stone-100 animate-pulse">
                  {mistakeBook.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Core Layout Hub */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* ================= VIEW A: GENERATOR WORKSPACE ================= */}
        {activeTab === "generate" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Controls Deck: 5 Columns Grid span */}
            <section className="lg:col-span-5 space-y-6">
              
              {/* Card 1: Parameters Setup */}
              <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-5">
                <div className="border-b border-stone-100 pb-3 flex justify-between items-center">
                  <h3 className="font-bold text-stone-900 text-sm tracking-wide uppercase flex items-center gap-1.5">
                    <Filter className="w-4 h-4 text-indigo-500" />
                    第1步: 选择学科语境
                  </h3>
                  <span className="text-xs text-stone-400">精准锁定专属知识谱系</span>
                </div>

                <div className="space-y-4">
                  {/* Subject Radio chips */}
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-2">
                      学科领域
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {subjectsList.map((subject) => (
                        <button
                          key={subject}
                          type="button"
                          id={`subject-${subject}`}
                          onClick={() => {
                            setSelectedSubject(subject);
                            // Clear sample selection to keep context clean
                            setSelectedSampleId(null);
                          }}
                          className={`py-2 px-3 text-xs font-semibold rounded-xl text-center border transition-all ${
                            selectedSubject === subject
                              ? "bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm"
                              : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                          }`}
                        >
                          {subject}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grade Radio chips */}
                  <div>
                    <label className="block text-xs font-bold text-stone-500 mb-2">
                      学段范围
                    </label>
                    <div className="flex space-x-2">
                      {gradesList.map((grade) => (
                        <button
                          key={grade}
                          type="button"
                          id={`grade-${grade}`}
                          onClick={() => {
                            setSelectedGrade(grade);
                            setSelectedSampleId(null);
                          }}
                          className={`flex-1 py-1 px-4 text-xs font-semibold rounded-lg text-center border transition-all ${
                            selectedGrade === grade
                              ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                              : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                          }`}
                        >
                          {grade}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Interactive Photo Upload Component */}
              <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm space-y-4">
                <div className="border-b border-stone-100 pb-3 flex justify-between items-center">
                  <h3 className="font-bold text-stone-900 text-sm tracking-wide uppercase flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-indigo-500" />
                    第2步: 上传错题大图
                  </h3>
                  <button
                    onClick={() => {
                      setIsManualInput(!isManualInput);
                    }}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    {isManualInput ? "返回图片上传" : "手动输入题目文本..."}
                  </button>
                </div>

                {isManualInput ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-stone-500">
                      请粘贴或在此直接输入题目文字内容:
                    </label>
                    <textarea
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="例：已知动能定律 W = Fs，如果摩擦力做功..."
                      className="w-full h-36 bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-stone-400">
                      提示：如无相机，可在右侧通过挑选「例：初中数学 - 一元二次方程」等预制样例立即进行评测。
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Upload Drag Target */}
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`relative overflow-hidden cursor-pointer rounded-2xl border-2 border-dashed transition-all p-5 flex flex-col items-center justify-center min-h-[160px] text-center ${
                        isDragging
                          ? "border-indigo-500 bg-indigo-50/50"
                          : uploadedImage
                          ? "border-indigo-100 bg-stone-50"
                          : "border-stone-200 hover:border-indigo-300 bg-stone-50/50"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        accept="image/*"
                        className="hidden"
                      />

                      {uploadedImage ? (
                        <div className="relative w-full group">
                          <img
                            src={uploadedImage}
                            alt="Uploaded original homework mistake preview"
                            className="w-full max-h-48 object-contain rounded-lg border border-stone-100 shadow-xs"
                          />
                          <div className="absolute inset-0 bg-stone-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <span className="text-white text-xs font-semibold bg-stone-800/80 px-3 py-1.5 rounded-md flex items-center gap-1">
                              <Upload className="w-3.5 h-3.5" />
                              点击重新上传
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="mx-auto w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-stone-400" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-stone-700">
                              拖拽错题图片到此处，或 <span className="text-indigo-600 underline">点击上传</span>
                            </p>
                            <p className="text-[10px] text-stone-400 mt-1">
                              支持 PNG, JPG 等格式，保持字迹清晰以获得最佳精准度
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Presets Gallery (Gives instantly interactive experience) */}
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-stone-500 flex items-center gap-1 justify-between">
                        <span>无真题照片？可在此一键导入模仿真真错题：</span>
                        <HelpCircle className="w-3 h-3 text-stone-400" />
                      </p>
                      
                      <div className="grid grid-cols-1 gap-2">
                        {SAMPLE_PROBLEMS.map((sample) => (
                          <button
                            key={sample.id}
                            type="button"
                            onClick={() => handleSelectSample(sample)}
                            className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between text-xs overflow-hidden ${
                              selectedSampleId === sample.id
                                ? "border-indigo-200 bg-indigo-50/50 font-bold"
                                : "border-stone-200 hover:border-slate-300 hover:bg-stone-100/50 bg-white"
                            }`}
                          >
                            <div className="flex items-center space-x-2 truncate">
                              <span className="inline-flex shrink-0 w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span className="text-stone-800 truncate">{sample.name}</span>
                            </div>
                            <span className="text-[10px] text-stone-400 italic shrink-0 underline ml-1">
                              {selectedSampleId === sample.id ? "已载入样本" : "一键导入"}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Primary AI Master Trigger Row */}
              <div className="pt-2">
                <button
                  id="btn-click-generate"
                  onClick={handleGenerateQuestions}
                  disabled={loading}
                  className={`w-full py-4 px-6 rounded-2xl font-bold text-sm tracking-wide flex items-center justify-center space-x-2 shadow-lg transition-transform hover:scale-[1.01] active:scale-95 ${
                    loading
                      ? "bg-stone-300 text-stone-500 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200"
                  }`}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>正在识别解析并生成举一反三题目...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-white animate-pulse" />
                      <span>生成举一反三题目</span>
                    </>
                  )}
                </button>
                <p className="text-stone-400 text-[11px] text-center mt-2.5 leading-relaxed">
                  系统将智能化解析上述错题图文，并根据设定的科目，动态生成 3 道解题思路和重难点高度一致的相似练习题。
                </p>
              </div>

            </section>

            {/* Right Display Area: 7 Columns Grid span */}
            <section className="lg:col-span-7 space-y-6">
              
              {/* If first initial state - friendly welcome guide banner */}
              {!loading && !analogyResult && !errorMsg && (
                <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-6 shadow-xs">
                  <div className="max-w-md mx-auto space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto shadow-inner text-amber-500">
                      <BookOpen className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-bold text-stone-800">
                        智能相似题生成工作台
                      </h3>
                      <p className="text-stone-500 text-xs leading-relaxed">
                        在左侧上传或拍下试卷、作业本中的任意错题图片，或者直接选择预制的 3 个精心绘制的“学生错题本”仿真草稿，然后点击“生成举一反三题目”极速体验！
                      </p>
                    </div>

                    <div className="border border-stone-100 rounded-xl p-4 bg-stone-50/50 text-left">
                      <h4 className="text-xs font-bold text-stone-600 flex items-center gap-1.5 mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                        系统内置五重智能出题策略：
                      </h4>
                      <ul className="text-stone-400 text-[11px] space-y-1 ml-5 list-disc leading-relaxed">
                        <li>
                          <strong className="text-stone-500">真题考点诊断：</strong>
                          高精度大模型自动探测弱点核心和易错考点；
                        </li>
                        <li>
                          <strong className="text-stone-500">维度变式延伸：</strong>
                          3道相似题在数据、物理模型或语序上进行科学变式；
                        </li>
                        <li>
                          <strong className="text-stone-500">梯度适配解题：</strong>
                          确保生成的解题方法和步骤完全与原错题看齐；
                        </li>
                        <li>
                          <strong className="text-stone-500">永久错题归档：</strong>
                          一键保存至数据库错题本中支持全科目复习。
                        </li>
                      </ul>
                    </div>

                    <div className="pt-2 animate-bounce">
                      <span className="inline-flex items-center space-x-1 py-1 px-3 bg-indigo-50 border border-indigo-100 text-[11px] font-semibold text-indigo-700 rounded-full">
                        <span>← 点击左侧“一键导入”错题开始体验吧</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Loading active progress loader */}
              {loading && (
                <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center space-y-4 shadow-sm">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <div className="relative">
                      <div className="w-14 h-14 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                      <Sparkles className="w-5 h-5 text-indigo-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="text-sm font-bold text-stone-800">
                        正在极速召集 AI 研题专家...
                      </h4>
                      <p className="text-xs text-stone-500">
                        正在识别图片 ➔ 定位基础考点 ➔ 多变式算法演算 ➔ 梳理答案解析
                      </p>
                    </div>
                  </div>
                  
                  {/* Decorative status ticker panel */}
                  <div className="max-w-xs mx-auto border border-stone-100 rounded-lg p-3 bg-stone-50 text-[10px] text-stone-400 text-left space-y-1 font-mono">
                    <div className="flex items-center justify-between text-indigo-500 font-bold">
                      <span>● ANALYZING_IMAGE_METADATA</span>
                      <span>100%</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-500">
                      <span>● GEOMETRIC_KNOWLEDGE_MAPPING</span>
                      <span>PROCESSED</span>
                    </div>
                    <div className="flex items-center justify-between animate-pulse">
                      <span>➤ GENERATING_3_ANALOGIES_BATCH</span>
                      <span>RUNNING</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error warning display */}
              {errorMsg && !loading && (
                <div className="bg-red-50 rounded-2xl border border-red-200 p-6 space-y-3">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-red-800">智能分析遇到些许故障</h4>
                      <p className="text-xs text-red-700 leading-relaxed">{errorMsg}</p>
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={handleGenerateQuestions}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>重新建立连接并请求</span>
                    </button>
                  </div>
                </div>
              )}

              {/* ============ CORE DISPLAY: GENERATED WRITING & ANALOGY ============ */}
              {analogyResult && !loading && (
                <div className="space-y-6">
                  
                  {/* Card: Original Mistake Diagnostics review */}
                  <div className="bg-white rounded-2xl border border-stone-200/90 overflow-hidden shadow-sm">
                    {/* Top Accent bar */}
                    <div className="bg-indigo-600 px-6 py-3 flex items-center justify-between text-white">
                      <div className="flex items-center space-x-2">
                        <BookMarked className="w-4 h-4" />
                        <span className="text-xs font-bold tracking-wider">
                          【当前错题考点深度研判反馈】
                        </span>
                      </div>
                      <span className="text-[11px] font-mono bg-indigo-700 px-2 py-0.5 rounded uppercase">
                        {analogyResult.subject} · {analogyResult.grade}
                      </span>
                    </div>
                    
                    <div className="p-6 space-y-4">
                      {/* Knowledge point ribbon */}
                      <div>
                        <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wide block">
                          诊断核心知识点
                        </span>
                        <div className="mt-1 flex items-center space-x-2">
                          <span className="text-sm font-bold text-stone-900 bg-amber-50 border border-amber-200 px-3 py-1 rounded-lg">
                            {analogyResult.originalQuestion.knowledgePoint || "待识别考点"}
                          </span>
                        </div>
                      </div>

                      {/* AI transcripted content */}
                      <div className="bg-stone-50/70 rounded-xl p-4 border border-stone-100">
                        <span className="text-[11px] text-stone-500 font-bold block mb-1">
                          错题段落内容回顾：
                        </span>
                        <p className="text-stone-800 text-xs leading-relaxed whitespace-pre-wrap">
                          {analogyResult.originalQuestion.content}
                        </p>
                      </div>

                      {/* Instructor analysis insights */}
                      <div className="space-y-1.5 border-l-2 border-amber-400 pl-3.5">
                        <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1">
                          学习诊断与易错点剖析:
                        </h4>
                        <p className="text-stone-600 text-xs leading-relaxed">
                          {analogyResult.originalQuestion.analysis}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Header row for Similar Practice exercise ledger */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div>
                      <h3 id="analogy-practice-header" className="text-lg font-extrabold text-stone-900 flex items-center gap-1.5">
                        举一反三特训（3道精选相似练习题）
                      </h3>
                      <p className="text-xs text-stone-500">
                        基于该题核心解题方法链条专门生成的适配变式训练
                      </p>
                    </div>

                    {/* Quick controls panel */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <button
                        onClick={handleReGenerate}
                        className="py-1.5 px-3 bg-white border border-stone-200 hover:border-indigo-300 text-stone-700 hover:text-indigo-600 text-xs font-bold rounded-xl transition-all flex items-center space-x-1"
                        title="不满意？立刻换一批新同类型练习题"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>重新生成</span>
                      </button>

                      {hasSavedCurrent ? (
                        <span className="py-1.5 px-3 bg-green-50 border border-green-200 text-green-700 text-xs font-semibold rounded-xl flex items-center space-x-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>已存错题本</span>
                        </span>
                      ) : (
                        <button
                          onClick={handleSaveToBook}
                          className="py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center space-x-1.5"
                        >
                          <Bookmark className="w-3.5 h-3.5 fill-white/20" />
                          <span>保存错题库</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Similarity Problems Stack */}
                  <div className="space-y-4">
                    {analogyResult.similarQuestions.map((q, idx) => {
                      const isRevealed = !!revealedSolutions[idx.toString()];
                      return (
                        <div
                          key={q.id || `sim_${idx}`}
                          className="bg-white rounded-2xl border border-stone-200 shadow-xs hover:border-slate-300 overflow-hidden transition-all"
                        >
                          {/* Card Sub-header bar */}
                          <div className="bg-stone-50/80 px-5 py-3 border-b border-stone-100 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-stone-200 text-stone-700">
                                相似练 {idx + 1}
                              </span>
                              <span className="text-xs font-semibold text-stone-500">
                                {q.type || "选择填空综合"}
                              </span>
                            </div>

                            <span className="text-[11px] text-stone-400 font-mono">
                              难度: 匹配错题
                            </span>
                          </div>

                          <div className="p-5 space-y-4">
                            {/* Question body */}
                            <p className="text-stone-800 text-sm font-medium leading-relaxed whitespace-pre-wrap">
                              {q.content}
                            </p>

                            {/* Option list if multiple choice */}
                            {q.options && q.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                                {q.options.map((option, optIdx) => {
                                  // Strip options prefixes like 'A.' if already present, but render nicely
                                  return (
                                    <div
                                      key={optIdx}
                                      className="py-2.5 px-4 rounded-xl border border-stone-100 hover:border-indigo-100 bg-stone-50 hover:bg-indigo-50/20 text-stone-700 text-xs transition-all flex items-center justify-between"
                                    >
                                      <span>{option}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Interactive toggle for Answers and Expert analysis */}
                            <div className="border-t border-stone-100 pt-3 flex flex-col space-y-2">
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() => toggleSolution(idx.toString())}
                                  className="text-xs font-bold text-stone-500 hover:text-indigo-600 transition-colors flex items-center gap-1 py-1"
                                >
                                  {isRevealed ? (
                                    <>
                                      <ChevronUp className="w-4 h-4 text-indigo-500" />
                                      <span>收起参考答案与深度解析</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-4 h-4 text-indigo-500" />
                                      <span>查看参考答案与深度解析</span>
                                    </>
                                  )}
                                </button>

                                {!isRevealed && (
                                  <span className="text-[10px] text-stone-400 italic">
                                    建议先在草稿纸作答哦 ✍️
                                  </span>
                                )}
                              </div>

                              {/* Revealed Section */}
                              {isRevealed && (
                                <div className="mt-2 bg-amber-50/50 rounded-xl p-4 border border-amber-100/60 text-xs space-y-3 animate-fadeIn">
                                  {/* Answer indicator */}
                                  <div>
                                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">
                                      正确答案
                                    </span>
                                    <p className="text-sm font-extrabold text-stone-900 mt-0.5">
                                      {q.answer}
                                    </p>
                                  </div>

                                  {/* Deep details tutor breakdown */}
                                  <div className="border-t border-amber-100/60 pt-2.5">
                                    <span className="text-[10px] text-stone-500 font-bold block mb-1">
                                      思路深度解析：
                                    </span>
                                    <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">
                                      {q.analysis}
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Primary Bottom Action Row Card */}
                  <div className="bg-gradient-to-r from-stone-900 to-indigo-950 text-white rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                    <div className="space-y-1 text-center md:text-left">
                      <h4 className="text-sm font-bold text-white flex items-center justify-center md:justify-start gap-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        错题练习对决卡完成！
                      </h4>
                      <p className="text-stone-300 text-xs">
                        点击一键保存按钮，系统在本地将该问题的所有衍生习题生成完整的归纳本，以便随时巩固！
                      </p>
                    </div>

                    <div className="flex space-x-2 w-full md:w-auto shrink-0 justify-center">
                      <button
                        onClick={handleReGenerate}
                        className="py-2.5 px-4 bg-stone-800/80 hover:bg-stone-800 text-stone-200 border border-stone-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>换一批题目</span>
                      </button>

                      {hasSavedCurrent ? (
                        <button
                          onClick={() => setActiveTab("mistake-book")}
                          className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                        >
                          <BookOpen className="w-4 h-4" />
                          <span>去错题本查看</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleSaveToBook}
                          className="py-2.5 px-5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 animate-pulse"
                        >
                          <Bookmark className="w-4 h-4" />
                          <span>保存到错题库</span>
                        </button>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </section>
          </div>
        )}

        {/* ================= VIEW B: MISTAKE LEDGER BOOK ================= */}
        {activeTab === "mistake-book" && (
          <div className="space-y-6">
            
            {/* Header, Search & Filter panel */}
            <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-stone-900 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    我的自建错题本
                  </h2>
                  <p className="text-xs text-stone-500">
                    目前已保存在线错题及举一反三特训练习：
                    <strong className="text-stone-800 font-mono bg-stone-100 px-1.5 py-0.5 rounded ml-1">
                      {mistakeBook.length}
                    </strong> 道
                  </p>
                </div>

                {mistakeBook.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空所有错题记录</span>
                  </button>
                )}
              </div>

              {/* Filtering Controls */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2">
                {/* Search Bar */}
                <div className="md:col-span-8 relative">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="按知识点名称、题干文字、考点解析快速检索错题..."
                    className="w-full bg-stone-50 text-stone-800 text-xs border border-stone-200 rounded-xl pl-10 pr-4 py-3 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>

                {/* Subject Filter chips on row */}
                <div className="md:col-span-4 select-none">
                  <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="w-full bg-stone-50 text-stone-700 text-xs border border-stone-200 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="全部">全部学科</option>
                    {subjectsList.map((sub) => (
                      <option key={sub} value={sub}>
                        仅看：{sub}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Empty state prompt */}
            {filteredBook.length === 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center max-w-lg mx-auto space-y-4">
                <div className="w-16 h-16 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                  <BookMarked className="w-8 h-8" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-stone-800">暂无符合条件的错题本档案</h3>
                  <p className="text-xs text-stone-500">
                    {mistakeBook.length === 0
                      ? "你还没有保存过任何错题！请去“智能识别生成”栏目中，上传错题图片并为其生成练习题后点击“保存错题库”操作。"
                      : "未找到符合您搜索和学科筛选条件的已存错题记录。"}
                  </p>
                </div>
                {mistakeBook.length === 0 && (
                  <div>
                    <button
                      onClick={() => setActiveTab("generate")}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>精美图文评测体验</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Grid display of mistakes */}
            {filteredBook.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBook.map((record) => {
                  return (
                    <div
                      key={record.id}
                      onClick={() => {
                        setSelectedBookItem(record);
                        setRevealedSavedSolutions({});
                      }}
                      className="bg-white rounded-2xl border border-stone-200 hover:border-indigo-200 hover:shadow-md cursor-pointer overflow-hidden transition-all flex flex-col group h-full"
                    >
                      {/* Top ribbon info and metadata */}
                      <div className="p-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                          {record.subject} · {record.grade}
                        </span>
                        
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(record.createdAt).toLocaleDateString("zh-CN", {
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </span>
                          
                          <button
                            type="button"
                            onClick={(e) => handleDeleteRecord(record.id, e)}
                            className="p-1 rounded text-stone-400 hover:text-red-500 hover:bg-red-50/50 transition-colors"
                            title="从错题本移除这组数据"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Content body */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                        <div className="space-y-2">
                          <h4 className="text-sm font-extrabold text-stone-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                            {record.title}
                          </h4>
                          
                          <p className="text-xs text-stone-500 line-clamp-3 leading-relaxed whitespace-pre-wrap">
                            {record.originalQuestion.content}
                          </p>
                        </div>

                        {/* Thumbnail image if base64 exists */}
                        {record.image && (
                          <div className="relative aspect-video w-full rounded-lg bg-stone-50 overflow-hidden border border-stone-100 shrink-0">
                            <img
                              src={record.image}
                              alt="Thumbnail preview of handwritten mistake ledger"
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-1 right-1 bg-stone-900/70 text-[9px] text-stone-200 font-semibold px-1 rounded">
                              附原错题大图
                            </div>
                          </div>
                        )}

                        {/* Mini footer */}
                        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] font-semibold text-indigo-600 shrink-0">
                          <span className="flex items-center gap-1.5">
                            <LayersIcon className="w-3.5 h-3.5" />
                            <span>举一反三巩固练习 {record.similarQuestions.length} 道</span>
                          </span>
                          <span className="group-hover:translate-x-1.5 transition-transform text-[10px] font-bold flex items-center gap-0.5">
                            <span>详情特训研学</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Split Screen Modal Overlay viewer when clicking an item */}
            {selectedBookItem && (
              <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-end animate-fadeIn">
                
                {/* Backdrop dismiss touch surface */}
                <div
                  className="absolute inset-0"
                  onClick={() => setSelectedBookItem(null)}
                />

                {/* Panel Slider Drawer */}
                <div className="relative w-full max-w-3xl h-full bg-stone-50 shadow-2xl flex flex-col z-10 animate-slideLeft overflow-hidden border-l border-stone-200">
                  
                  {/* Ledger Drawer Header */}
                  <div className="bg-stone-900 text-white p-5 pr-14 flex items-center justify-between shrink-0">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold tracking-widest bg-amber-500 text-stone-950 px-2 py-0.5 rounded">
                          {selectedBookItem.subject} · {selectedBookItem.grade}
                        </span>
                        <span className="text-xs text-stone-400">
                          {new Date(selectedBookItem.createdAt).toLocaleString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </span>
                      </div>
                      <h3 className="text-base font-bold tracking-tight">
                        {selectedBookItem.title}
                      </h3>
                    </div>

                    <button
                      onClick={() => setSelectedBookItem(null)}
                      className="absolute right-4 top-4 w-9 h-9 flex items-center justify-center rounded-full bg-stone-800 text-stone-300 hover:text-white hover:bg-stone-700 transition-colors"
                      title="关闭窗口"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Ledger Scrollable Content body */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    
                    {/* Grid view containing original error image alongside the OCR draft */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                      
                      {/* Left: Original Error image */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          原版错题图像存证：
                        </h4>
                        
                        {selectedBookItem.image ? (
                          <div className="bg-white rounded-xl p-2 border border-stone-200 shadow-xs">
                            <img
                              src={selectedBookItem.image}
                              alt="Deep view of mistake homework handwritten draft"
                              className="w-full h-auto max-h-64 object-contain rounded-lg"
                            />
                          </div>
                        ) : (
                          <div className="bg-stone-100 rounded-xl py-12 text-center text-stone-400 text-xs">
                            该错题仅记录了纯文本，未上传图像
                          </div>
                        )}
                      </div>

                      {/* Right: AI diagnostic panel */}
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-indigo-500" />
                            考点诊断诊断书：
                          </h4>
                          
                          <div className="bg-white rounded-xl p-4 border border-stone-200 text-xs space-y-3">
                            <div>
                              <strong className="text-stone-500 block mb-0.5">提取的核心考点：</strong>
                              <span className="text-stone-900 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md inline-block">
                                {selectedBookItem.originalQuestion.knowledgePoint}
                              </span>
                            </div>
                            
                            <div>
                              <strong className="text-stone-500 block mb-0.5">
                                原题文字转录 (OCR)：
                              </strong>
                              <p className="text-stone-700 italic border-l-2 border-stone-300 pl-2 leading-relaxed font-serif whitespace-pre-wrap">
                                {selectedBookItem.originalQuestion.content}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Analysis info bubble */}
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-xs space-y-1">
                          <strong className="text-indigo-900 font-bold block">
                            核心提炼与错因补习建议：
                          </strong>
                          <p className="text-indigo-800 leading-relaxed">
                            {selectedBookItem.originalQuestion.analysis}
                          </p>
                        </div>
                      </div>

                    </div>

                    {/* Generated Exercises display checklist */}
                    <div className="space-y-4">
                      <div className="border-b border-stone-200 pb-2 flex items-center justify-between">
                        <h4 className="text-sm font-black text-stone-900 flex items-center gap-1.5">
                          <Plus className="w-4 h-4 text-emerald-500" />
                          举一反三特训练习：
                        </h4>
                        <span className="text-xs text-stone-400">一键练习极速提升</span>
                      </div>

                      <div className="space-y-4">
                        {selectedBookItem.similarQuestions.map((q, idx) => {
                          const isRevealed = !!revealedSavedSolutions[idx.toString()];
                          return (
                            <div
                              key={q.id || `saved_sim_${idx}`}
                              className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-xs hover:border-slate-300 transition-all"
                            >
                              <div className="bg-stone-50/70 px-4 py-2.5 border-b border-stone-100 flex items-center justify-between text-xs">
                                <span className="font-bold text-stone-700">相似练习题 {idx + 1}</span>
                                <span className="text-stone-400">{q.type}</span>
                              </div>

                              <div className="p-4 space-y-3">
                                <p className="text-stone-800 text-xs font-semibold leading-relaxed whitespace-pre-wrap">
                                  {q.content}
                                </p>

                                {/* Option list */}
                                {q.options && q.options.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                    {q.options.map((option, optIdx) => (
                                      <div
                                        key={optIdx}
                                        className="py-2 px-3 rounded-lg border border-stone-100 bg-stone-50/60 text-stone-700 text-[11px]"
                                      >
                                        {option}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Retractable control */}
                                <div className="border-t border-stone-100 pt-2 flex flex-col space-y-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleSavedSolution(idx.toString())}
                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 py-1"
                                  >
                                    {isRevealed ? (
                                      <>
                                        <ChevronUp className="w-3 h-3" />
                                        <span>收起答案与深度解析</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3 h-3" />
                                        <span>展开参考答案与解析</span>
                                      </>
                                    )}
                                  </button>

                                  {isRevealed && (
                                    <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100/50 text-[11px] space-y-2.5 animate-fadeIn">
                                      <div>
                                        <span className="text-[9px] text-amber-700 font-bold block uppercase">
                                          最终标准答卷
                                        </span>
                                        <p className="text-xs font-black text-stone-950">
                                          {q.answer}
                                        </p>
                                      </div>
                                      
                                      <div className="border-t border-amber-100/50 pt-2">
                                        <span className="text-[9px] text-stone-500 font-bold block">
                                          解析思路：
                                        </span>
                                        <p className="text-stone-700 leading-relaxed whitespace-pre-wrap">
                                          {q.analysis}
                                        </p>
                                      </div>
                                    </div>
                                  )}
                                </div>

                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                  {/* Drawer Footer Actions */}
                  <div className="p-4 bg-stone-100 border-t border-stone-250 flex items-center justify-between shrink-0">
                    <button
                      onClick={() => handleDeleteRecord(selectedBookItem.id)}
                      className="py-2 px-4 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-colors flex items-center space-x-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>从错题本抹除此本记录</span>
                    </button>

                    <button
                      onClick={() => setSelectedBookItem(null)}
                      className="py-2 px-6 bg-stone-900 hover:bg-stone-850 text-white text-xs font-bold rounded-xl transition-colors"
                    >
                      返回账册列表
                    </button>
                  </div>

                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Solid High-End footer with metadata labels */}
      <footer className="bg-white border-t border-stone-200 py-6 mt-12 shrink-0">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-1.5 text-stone-400 text-xs font-normal">
          <p>© 2026 错题智学 · 举一反三特训系统 - 支持智能考点探测</p>
          <p className="text-[11px] text-stone-300">
            Powered by Gemini 3.5 Flash · 针对试卷与手账错题设计
          </p>
        </div>
      </footer>
    </div>
  );
}

// Inline mini helper component for custom icon representing layers or multiple pages
function LayersIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="2"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.429 9.75L2.25 12l4.179 2.25m11.142 0L21.75 12l-4.179-2.25M12 5.25L16.179 7.5 12 9.75 7.821 7.5 12 5.25zm0 9l4.179 2.25L12 18.75l-4.179-2.25L12 14.25z"
      />
    </svg>
  );
}
