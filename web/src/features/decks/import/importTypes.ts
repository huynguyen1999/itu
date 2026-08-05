export interface ParsedCard {
  id: string;
  question: string;
  answer: string;
  nextReviewDate: string;
  generateReverse: boolean;
  errors: string[];
}

export interface ImportCardInput {
  question: string;
  answer: string;
  nextReviewDate?: string;
  generateReverse?: boolean;
}
