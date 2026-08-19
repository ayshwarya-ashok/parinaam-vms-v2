import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface TrainingSummary {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  duration: string;
  mode: 'Online' | 'In person';
  category: 'compliance' | 'activity';
  status: 'active' | 'inactive';
  passingScore: number;
  isMandatory: boolean;
  maxAttempts: number | null;
  expiryMonths: number | null;
  materialCount?: number;
  questionCount?: number;
}

export interface MyTraining {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  duration: string;
  mode: string;
  category: string;
  passingScore: number;
  isMandatory: boolean;
  maxAttempts: number | null;
  questionCount: number;
  attemptsUsed: number;
  latestScore: number | null;
  currentlyPassed: boolean;
  expiryDate: string | null;
  exhausted: boolean;
}

export interface MyTrainingsFeed {
  mandatory: MyTraining[];
  activityUnlocked: boolean;
  activity: MyTraining[];
}

export interface TrainingDetail extends TrainingSummary {
  materials: Array<{
    id: string;
    name: string;
    fileType: 'pdf' | 'ppt' | 'doc' | 'vid';
    fileSizeText: string | null;
  }>;
  questions: Array<{
    id: string;
    questionText: string;
    options: Array<{ index: number; text: string }>;
    correctOptionIndex?: number;
  }>;
}

export interface QuizStart {
  trainingId: string;
  attemptNumber: number;
  passingScore: number;
  questions: TrainingDetail['questions'];
}

export interface QuizResult {
  attemptNumber: number;
  score: number;
  correctCount: number;
  questionCount: number;
  passed: boolean;
  expiryDate: string | null;
  remainingAttempts: number | null;
  review: Array<{
    id: string;
    questionText: string;
    options: Array<{ index: number; text: string }>;
    correctOptionIndex: number;
    selectedIndex: number | null;
  }>;
}

export interface AssessmentRow {
  volunteerId: string;
  name: string;
  email: string;
  attemptsUsed: number;
  maxAttempts: number | null;
  scores: number[];
  passed: boolean;
  exhausted: boolean;
  expiryDate: string | null;
}

export const useTrainingsList = (filters: Record<string, string | undefined>) =>
  useQuery({
    queryKey: ['trainings', 'list', filters],
    queryFn: async () =>
      (await api.get<TrainingSummary[]>('/trainings', { params: filters })).data,
  });

export const useTraining = (id: string | undefined) =>
  useQuery({
    queryKey: ['training', id],
    queryFn: async () => (await api.get<TrainingDetail>(`/trainings/${id}`)).data,
    enabled: !!id,
  });

export const useMyTrainings = () =>
  useQuery({
    queryKey: ['my-trainings'],
    queryFn: async () => (await api.get<MyTrainingsFeed>('/trainings/me')).data,
  });

export const useAssessments = (id: string, status: string) =>
  useQuery({
    queryKey: ['assessments', id, status],
    queryFn: async () =>
      (
        await api.get<AssessmentRow[]>(`/trainings/${id}/assessments`, {
          params: { status: status === 'all' ? undefined : status },
        })
      ).data,
  });

export function useTrainingInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['trainings'] });
    void qc.invalidateQueries({ queryKey: ['training'] });
    void qc.invalidateQueries({ queryKey: ['my-trainings'] });
    void qc.invalidateQueries({ queryKey: ['assessments'] });
    void qc.invalidateQueries({ queryKey: ['compliance'] });
  };
}

export function useSubmitQuiz(trainingId: string) {
  const invalidate = useTrainingInvalidation();
  return useMutation({
    mutationFn: async (answers: Array<{ questionId: string; selectedIndex: number }>) =>
      (await api.post<QuizResult>(`/trainings/${trainingId}/attempts/submit`, { answers })).data,
    onSuccess: invalidate,
  });
}

export const materialDownloadUrl = (trainingId: string, materialId: string) =>
  `/trainings/${trainingId}/materials/${materialId}/download`;
