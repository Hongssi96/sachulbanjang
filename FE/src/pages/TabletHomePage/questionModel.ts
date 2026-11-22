export type QuestionSelection = {
  product: string;
  line: string;
  topic: string;
  view: string;
  period: string;
};
export const emptyQuestionSelection: QuestionSelection = {
  product: '',
  line: '',
  topic: '',
  view: '',
  period: '',
};
