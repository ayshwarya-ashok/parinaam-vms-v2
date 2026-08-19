import {
  Alert,
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import {
  materialDownloadUrl,
  useSubmitQuiz,
  useTraining,
  type QuizResult,
  type QuizStart,
} from '@/api/trainings';
import { PageShell } from '@/components';
import { tokens } from '@/theme';

const FILE_ICONS: Record<string, string> = { pdf: '📄', ppt: '📊', doc: '📝', vid: '🎬' };

type QuizPhase =
  | { step: 'idle' }
  | { step: 'active'; quiz: QuizStart }
  | { step: 'done'; result: QuizResult };

export function TrainingView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: training } = useTraining(id);

  const [tab, setTab] = useState<'materials' | 'quiz'>('materials');
  const [phase, setPhase] = useState<QuizPhase>({ step: 'idle' });
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: async () => (await api.post<QuizStart>(`/trainings/${id}/attempts`)).data,
    onSuccess: (quiz) => {
      setAnswers({});
      setError(null);
      setPhase({ step: 'active', quiz });
    },
    onError: (err) => setError(asApiError(err)?.message ?? 'Could not start the quiz.'),
  });

  const submit = useSubmitQuiz(id!);

  if (!training) {
    return (
      <PageShell eyebrow="My Trainings" title="Loading…">
        <span />
      </PageShell>
    );
  }

  const questions = phase.step === 'active' ? phase.quiz.questions : [];
  const answered = Object.keys(answers).length;

  const handleSubmit = () =>
    submit.mutate(
      Object.entries(answers).map(([questionId, selectedIndex]) => ({
        questionId,
        selectedIndex,
      })),
      {
        onSuccess: (result) => setPhase({ step: 'done', result }),
        onError: (err) => setError(asApiError(err)?.message ?? 'Submission failed.'),
      },
    );

  return (
    <PageShell
      eyebrow="My Trainings"
      title={training.name}
      description={training.description ?? undefined}
      actions={
        <>
          <Chip label={training.category} size="small" variant="outlined" />
          <Chip label={`${training.duration} · ${training.mode}`} size="small" variant="outlined" />
          <Chip label={`Pass at ${training.passingScore}%`} size="small" variant="outlined" />
        </>
      }
      maxWidth="md"
    >
      <Tabs
        value={tab}
        onChange={(_, v: 'materials' | 'quiz') => setTab(v)}
        sx={{
          mb: 2,
          '& .MuiTab-root': { fontWeight: 700 },
          '& .MuiTabs-indicator': { bgcolor: 'secondary.main', height: 3, borderRadius: 2 },
        }}
      >
        <Tab label={`📄 Materials (${training.materials.length})`} value="materials" />
        <Tab label={`✎ Quiz (${training.questions.length})`} value="quiz" />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {tab === 'materials' && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {training.materials.map((m) => (
            <Paper key={m.id} variant="outlined" sx={{ p: 1.5, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: 'rgba(255,255,255,0.8)' }}>
              <Typography sx={{ fontSize: '1.4rem' }}>{FILE_ICONS[m.fileType] ?? '📄'}</Typography>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{m.name}</Typography>
                <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                  {m.fileType.toUpperCase()}
                  {m.fileSizeText ? ` · ${m.fileSizeText}` : ''}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="pillOutlined"
                sx={{ px: 2, py: 0.5 }}
                onClick={async () => {
                  // A plain link carries no bearer token; fetch through the
                  // authenticated client and open the blob.
                  const res = await api.get(materialDownloadUrl(training.id, m.id), {
                    responseType: 'blob',
                  });
                  window.open(URL.createObjectURL(res.data as Blob), '_blank');
                }}
              >
                Open ↗
              </Button>
            </Paper>
          ))}
          {training.materials.length === 0 && (
            <Typography sx={{ color: 'text.secondary' }}>No materials attached yet.</Typography>
          )}
        </Box>
      )}

      {tab === 'quiz' && phase.step === 'idle' && (
        <Paper variant="outlined" sx={{ p: 5, borderRadius: 4, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.7)' }}>
          <Typography sx={{ fontSize: '2rem' }}>✎</Typography>
          <Typography variant="h3" sx={{ fontSize: '1.4rem', mb: 1 }}>
            Ready to take the quiz?
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 2.5 }}>
            Answer all {training.questions.length} questions and score{' '}
            <strong>{training.passingScore}%</strong> or above to pass.
            {training.isMandatory && training.maxAttempts && (
              <> Mandatory training — {training.maxAttempts} attempts maximum.</>
            )}
          </Typography>
          <Button variant="pill" onClick={() => start.mutate()} disabled={start.isPending} sx={{ minWidth: '10rem' }}>
            {start.isPending ? 'Preparing…' : 'Start quiz'}
          </Button>
        </Paper>
      )}

      {tab === 'quiz' && phase.step === 'active' && (
        <Box>
          <LinearProgress
            variant="determinate"
            value={(answered / questions.length) * 100}
            sx={{ height: 8, borderRadius: 999, mb: 2, bgcolor: 'rgba(19,35,37,0.08)', '& .MuiLinearProgress-bar': { bgcolor: tokens.accent, borderRadius: 999 } }}
          />
          <Box sx={{ display: 'grid', gap: 2 }}>
            {questions.map((q, qi) => (
              <Paper key={q.id} variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.8)' }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 700, textTransform: 'uppercase', mb: 0.5 }}>
                  Question {qi + 1} of {questions.length}
                </Typography>
                <Typography sx={{ fontWeight: 600, mb: 1.5 }}>{q.questionText}</Typography>
                <Box sx={{ display: 'grid', gap: 0.75 }} role="radiogroup" aria-label={`Question ${qi + 1}`}>
                  {q.options.map((option) => {
                    const chosen = answers[q.id] === option.index;
                    return (
                      <Paper
                        key={option.index}
                        component="button"
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: option.index }))}
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          borderRadius: 2,
                          textAlign: 'left',
                          cursor: 'pointer',
                          font: 'inherit',
                          display: 'flex',
                          gap: 1,
                          bgcolor: chosen ? alpha(tokens.accent, 0.1) : 'rgba(255,255,255,0.7)',
                          borderColor: chosen ? tokens.accent : undefined,
                        }}
                      >
                        <Typography sx={{ fontWeight: 700, color: 'text.secondary' }}>
                          {String.fromCharCode(65 + option.index)}
                        </Typography>
                        <Typography>{option.text}</Typography>
                      </Paper>
                    );
                  })}
                </Box>
              </Paper>
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button
              variant="pill"
              disabled={answered < questions.length || submit.isPending}
              onClick={handleSubmit}
              sx={{ minWidth: '10rem' }}
            >
              {submit.isPending
                ? 'Scoring…'
                : answered < questions.length
                  ? `Answer ${questions.length - answered} more`
                  : 'Submit quiz'}
            </Button>
          </Box>
        </Box>
      )}

      {tab === 'quiz' && phase.step === 'done' && (
        <Box>
          <Paper variant="outlined" sx={{ p: 4, borderRadius: 4, textAlign: 'center', mb: 2, bgcolor: 'rgba(255,255,255,0.8)' }}>
            <Typography sx={{ fontSize: '3rem', fontWeight: 800, color: phase.result.passed ? tokens.success : tokens.accentStrong }}>
              {phase.result.score}%
            </Typography>
            <Typography sx={{ color: 'text.secondary' }}>
              {phase.result.correctCount} of {phase.result.questionCount} correct · attempt #{phase.result.attemptNumber}
            </Typography>
            <Typography sx={{ fontWeight: 700, mt: 1, color: phase.result.passed ? tokens.success : tokens.accentStrong }}>
              {phase.result.passed
                ? phase.result.expiryDate
                  ? `✓ Passed! Valid until ${phase.result.expiryDate}`
                  : '✓ Passed! Training complete.'
                : phase.result.remainingAttempts === 0
                  ? '✕ Did not pass — no attempts remaining. Contact admin@parinaam.org.'
                  : `✕ Did not pass. ${phase.result.remainingAttempts ?? 'Unlimited'} attempt(s) remaining.`}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 2 }}>
              {!phase.result.passed && phase.result.remainingAttempts !== 0 && (
                <Button variant="pillOutlined" onClick={() => start.mutate()}>
                  Retake quiz
                </Button>
              )}
              <Button variant="pill" onClick={() => navigate('/app/trainings')}>
                Back to my trainings
              </Button>
            </Box>
          </Paper>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Answer review</Typography>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {phase.result.review.map((q, qi) => (
              <Paper key={q.id} variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.75)' }}>
                <Typography sx={{ fontWeight: 600, mb: 1 }}>
                  {qi + 1}. {q.questionText}
                </Typography>
                <Box sx={{ display: 'grid', gap: 0.5 }}>
                  {q.options.map((option) => {
                    const isCorrect = option.index === q.correctOptionIndex;
                    const wasChosen = option.index === q.selectedIndex;
                    return (
                      <Typography
                        key={option.index}
                        sx={{
                          px: 1.25,
                          py: 0.5,
                          borderRadius: 2,
                          fontSize: '0.9rem',
                          bgcolor: isCorrect ? alpha(tokens.success, 0.12) : wasChosen ? alpha(tokens.accentStrong, 0.1) : undefined,
                          fontWeight: isCorrect || wasChosen ? 600 : 400,
                        }}
                      >
                        {String.fromCharCode(65 + option.index)}. {option.text}
                        {isCorrect ? ' ✓' : wasChosen ? ' ✕ your answer' : ''}
                      </Typography>
                    );
                  })}
                </Box>
              </Paper>
            ))}
          </Box>
        </Box>
      )}

      <Box sx={{ mt: 3, textAlign: 'right' }}>
        <Button variant="pillOutlined" onClick={() => navigate('/app/trainings')}>
          ← Back to my trainings
        </Button>
      </Box>
    </PageShell>
  );
}
