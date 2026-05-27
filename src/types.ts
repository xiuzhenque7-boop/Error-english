export interface QuestionItem {
  id: string;
  type: string; // "选择题" | "填空题" | "解答题"
  content: string;
  options?: string[];
  answer: string;
  analysis: string;
}

export interface OriginalQuestion {
  content: string;
  knowledgePoint: string;
  analysis: string;
}

export interface AnalogyResult {
  subject: string;
  grade: string;
  originalQuestion: OriginalQuestion;
  similarQuestions: QuestionItem[];
}

export interface MistakeRecord {
  id: string; // unique ID
  createdAt: string; // ISO timestamp
  title: string; // custom or generated title based on knowledge point
  image?: string; // base64 representation of original uploaded error image
  subject: string;
  grade: string;
  originalQuestion: OriginalQuestion;
  similarQuestions: QuestionItem[];
}
