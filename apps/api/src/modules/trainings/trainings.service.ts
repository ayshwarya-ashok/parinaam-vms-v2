import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BusinessErrors, BusinessException } from '../../common';
import type { AuthPrincipal } from '../../common/decorators/auth.decorators';
import {
  Training,
  TrainingAttempt,
  TrainingAttemptAnswer,
  TrainingAttemptReset,
  TrainingMaterial,
  TrainingOption,
  TrainingQuestion,
  Volunteer,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

export interface QuestionInput {
  questionText: string;
  correctOptionIndex: number;
  options: string[];
}

@Injectable()
export class TrainingsService {
  constructor(
    @InjectRepository(Training) private readonly trainings: Repository<Training>,
    @InjectRepository(TrainingMaterial) private readonly materials: Repository<TrainingMaterial>,
    @InjectRepository(TrainingAttempt) private readonly attempts: Repository<TrainingAttempt>,
    @InjectRepository(Volunteer) private readonly volunteers: Repository<Volunteer>,
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  private async volunteerOf(principal: AuthPrincipal): Promise<Volunteer> {
    const v = await this.volunteers.findOne({ where: { userId: principal.sub } });
    if (!v) {
      throw new BusinessException('PROFILE_INCOMPLETE', 'Complete registration first.', 404);
    }
    return v;
  }

  // ── Admin catalog ──────────────────────────────────────────────────────────

  async adminList(query: { q?: string; category?: string; status?: string; mode?: string }) {
    const qb = this.trainings
      .createQueryBuilder('t')
      .loadRelationCountAndMap('t.materialCount', 't.materials')
      .loadRelationCountAndMap('t.questionCount', 't.questions')
      .orderBy('t.isMandatory', 'DESC')
      .addOrderBy('t.name', 'ASC');
    if (query.q) qb.andWhere('t.name ILIKE :q', { q: `%${query.q}%` });
    if (query.category) qb.andWhere('t.category = :c', { c: query.category });
    if (query.status) qb.andWhere('t.status = :s', { s: query.status });
    if (query.mode) qb.andWhere('t.mode = :m', { m: query.mode });
    return qb.getMany();
  }

  async create(principal: AuthPrincipal, dto: Partial<Training> & { name: string }) {
    // BR-03 is a schema constraint; surface it as a named error first.
    if (dto.isMandatory && (!dto.maxAttempts || !dto.expiryMonths)) {
      throw new BusinessException(
        'MANDATORY_NEEDS_LIMITS',
        'A mandatory training must set both an attempt cap and an expiry window (BR-03).',
        400,
      );
    }
    return this.trainings.save(
      this.trainings.create({
        name: dto.name,
        description: dto.description ?? null,
        duration: dto.duration ?? '1h',
        mode: dto.mode ?? 'Online',
        category: dto.category ?? 'activity',
        passingScore: dto.passingScore ?? 70,
        isMandatory: dto.isMandatory ?? false,
        maxAttempts: dto.maxAttempts ?? null,
        expiryMonths: dto.expiryMonths ?? null,
        createdBy: principal.sub,
      }),
    );
  }

  async update(id: string, dto: Partial<Training>) {
    const training = await this.trainings.findOneBy({ id });
    if (!training) throw new NotFoundException('Training not found');
    Object.assign(training, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.duration !== undefined && { duration: dto.duration }),
      ...(dto.mode !== undefined && { mode: dto.mode }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.passingScore !== undefined && { passingScore: dto.passingScore }),
    });
    return this.trainings.save(training);
  }

  async setStatus(id: string, status: 'active' | 'inactive') {
    await this.trainings.update({ id }, { status });
    return this.trainings.findOneByOrFail({ id });
  }

  // ── Materials ──────────────────────────────────────────────────────────────

  private static readonly FILE_TYPES: Record<string, 'pdf' | 'ppt' | 'doc' | 'vid'> = {
    'application/pdf': 'pdf',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'ppt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
    'video/mp4': 'vid',
    'video/webm': 'vid',
  };

  async addMaterial(
    principal: AuthPrincipal,
    trainingId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer },
  ) {
    const training = await this.trainings.findOneBy({ id: trainingId });
    if (!training) throw new NotFoundException('Training not found');

    const fileType = TrainingsService.FILE_TYPES[file.mimetype];
    if (!fileType) {
      throw new BusinessException(
        'UNSUPPORTED_FILE_TYPE',
        'Allowed: PDF, PowerPoint, Word, MP4/WebM video.',
        400,
      );
    }

    const ext = file.originalname.includes('.') ? file.originalname.split('.').pop()! : fileType;
    const path = this.storage.buildPath(`training-materials/${trainingId}`, ext);
    const stored = await this.storage.put(path, file.buffer);

    const [{ max }] = await this.dataSource.query(
      'SELECT COALESCE(MAX(sort_order), 0)::int AS max FROM training_materials WHERE training_id = $1',
      [trainingId],
    );

    const material = await this.materials.save(
      this.materials.create({
        trainingId,
        name: file.originalname,
        fileType,
        filePath: stored.path,
        mimeType: file.mimetype,
        fileSizeBytes: String(stored.sizeBytes),
        fileSizeText: StorageService.formatSize(stored.sizeBytes),
        contentHash: stored.contentHash,
        sortOrder: Number(max) + 1,
        uploadedBy: principal.sub,
      }),
    );

    // Content changed — attempts taken before this upload were against the old
    // material set. On mandatory trainings the admin must decide (BR-12).
    await this.trainings.increment({ id: trainingId }, 'contentVersion', 1);

    return {
      material,
      contentVersionBumped: true,
      requiresResetDecision: training.isMandatory,
    };
  }

  async removeMaterial(trainingId: string, materialId: string) {
    const material = await this.materials.findOneBy({ id: materialId, trainingId });
    if (!material) throw new NotFoundException('Material not found');
    await this.storage.delete(material.filePath);
    await this.materials.delete({ id: materialId });
    return { removed: true };
  }

  async materialFile(materialId: string) {
    const material = await this.materials.findOneBy({ id: materialId });
    if (!material) throw new NotFoundException('Material not found');
    const buffer = await this.storage.get(material.filePath);
    return { material, buffer };
  }

  // ── Quiz builder ───────────────────────────────────────────────────────────

  async replaceQuestions(trainingId: string, questions: QuestionInput[]) {
    for (const [index, question] of questions.entries()) {
      if (question.options.length < 2) {
        throw new BusinessException('QUESTION_INVALID', `Question ${index + 1} needs at least two options.`, 400);
      }
      if (question.correctOptionIndex < 0 || question.correctOptionIndex >= question.options.length) {
        throw new BusinessException('QUESTION_INVALID', `Question ${index + 1} marks a correct option that does not exist.`, 400);
      }
    }

    await this.dataSource.transaction(async (mgr) => {
      await mgr.delete(TrainingQuestion, { trainingId });
      for (const [sortOrder, q] of questions.entries()) {
        const saved = await mgr.save(
          mgr.create(TrainingQuestion, {
            trainingId,
            questionText: q.questionText,
            correctOptionIndex: q.correctOptionIndex,
            sortOrder,
          }),
        );
        for (const [optionIndex, optionText] of q.options.entries()) {
          await mgr.save(mgr.create(TrainingOption, { questionId: saved.id, optionIndex, optionText }));
        }
      }
    });
    return { count: questions.length };
  }

  // ── Detail (role-aware: answers stripped for volunteers) ──────────────────

  async detail(id: string, includeAnswers: boolean) {
    const training = await this.trainings.findOne({
      where: { id },
      relations: { materials: true, questions: { options: true } },
      order: { materials: { sortOrder: 'ASC' }, questions: { sortOrder: 'ASC', options: { optionIndex: 'ASC' } } },
    });
    if (!training) throw new NotFoundException('Training not found');

    return {
      ...training,
      questions: (training.questions ?? []).map((q) => ({
        id: q.id,
        questionText: q.questionText,
        options: (q.options ?? []).map((o) => ({ index: o.optionIndex, text: o.optionText })),
        // The correct index never reaches a volunteer before submission.
        ...(includeAnswers ? { correctOptionIndex: q.correctOptionIndex } : {}),
      })),
    };
  }

  // ── Volunteer feed (BR-02 gate, BR-04 lock) ────────────────────────────────

  async myTrainings(principal: AuthPrincipal) {
    const volunteer = await this.volunteerOf(principal);

    const [compliance] = await this.dataSource.query(
      'SELECT * FROM v_volunteer_compliance WHERE volunteer_id = $1',
      [volunteer.id],
    );
    if (!compliance?.consent_complete) throw BusinessErrors.consentRequired();

    const rows = await this.dataSource.query(
      `SELECT t.id, t.code, t.name, t.description, t.duration, t.mode, t.category,
              t.passing_score, t.is_mandatory, t.max_attempts, t.expiry_months,
              (SELECT COUNT(*)::int FROM training_questions q WHERE q.training_id = t.id) AS question_count,
              (SELECT COUNT(*)::int FROM training_attempts a
                WHERE a.training_id = t.id AND a.volunteer_id = $1 AND a.is_superseded = FALSE) AS attempts_used,
              (SELECT a.score_percent FROM training_attempts a
                WHERE a.training_id = t.id AND a.volunteer_id = $1 AND a.is_superseded = FALSE
                ORDER BY a.attempted_at DESC LIMIT 1) AS latest_score,
              vtp.attempt_id IS NOT NULL AS currently_passed,
              vtp.expiry_date
       FROM trainings t
       LEFT JOIN v_valid_training_passes vtp
         ON vtp.training_id = t.id AND vtp.volunteer_id = $1
       WHERE t.status = 'active'
       ORDER BY t.is_mandatory DESC, t.name`,
      [volunteer.id],
    );

    const mandatoryUnlocked = compliance.is_compliant === true;
    const mapped = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      duration: r.duration,
      mode: r.mode,
      category: r.category,
      passingScore: Number(r.passing_score),
      isMandatory: r.is_mandatory,
      maxAttempts: r.max_attempts === null ? null : Number(r.max_attempts),
      questionCount: Number(r.question_count),
      attemptsUsed: Number(r.attempts_used),
      latestScore: r.latest_score === null ? null : Number(r.latest_score),
      currentlyPassed: r.currently_passed,
      expiryDate: r.expiry_date,
      exhausted:
        r.is_mandatory === true &&
        r.currently_passed !== true &&
        r.max_attempts !== null &&
        Number(r.attempts_used) >= Number(r.max_attempts),
    }));

    return {
      mandatory: mapped.filter((t: { isMandatory: boolean }) => t.isMandatory),
      // BR-04: activity trainings stay locked until every mandatory one is held.
      activityUnlocked: mandatoryUnlocked,
      activity: mapped.filter((t: { isMandatory: boolean }) => !t.isMandatory),
    };
  }

  // ── Attempts (BR-02, BR-03, server-side scoring) ───────────────────────────

  async startAttempt(principal: AuthPrincipal, trainingId: string) {
    const volunteer = await this.volunteerOf(principal);
    const training = await this.trainings.findOneBy({ id: trainingId });
    if (!training || training.status !== 'active') throw new NotFoundException('Training not found');

    await this.assertMayAttempt(volunteer, training);

    const detail = await this.detail(trainingId, false);
    if (detail.questions.length === 0) {
      throw new BusinessException('NO_QUIZ', 'This training has no quiz yet.', 400);
    }

    const [{ next }] = await this.dataSource.query(
      `SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next
       FROM training_attempts WHERE volunteer_id = $1 AND training_id = $2`,
      [volunteer.id, trainingId],
    );
    return {
      trainingId,
      attemptNumber: Number(next),
      passingScore: training.passingScore,
      questions: detail.questions,
    };
  }

  async submitAttempt(
    principal: AuthPrincipal,
    trainingId: string,
    answers: Array<{ questionId: string; selectedIndex: number }>,
  ) {
    const volunteer = await this.volunteerOf(principal);
    const training = await this.trainings.findOneBy({ id: trainingId });
    if (!training) throw new NotFoundException('Training not found');

    await this.assertMayAttempt(volunteer, training);

    const questions = await this.dataSource.query(
      'SELECT id, correct_option_index FROM training_questions WHERE training_id = $1',
      [trainingId],
    );
    if (answers.length < questions.length) {
      throw new BusinessException('INCOMPLETE_QUIZ', 'Answer every question before submitting.', 400);
    }

    const correctByQuestion = new Map<string, number>(
      questions.map((q: { id: string; correct_option_index: number }) => [
        q.id,
        Number(q.correct_option_index),
      ]),
    );

    let correctCount = 0;
    const graded = answers
      .filter((a) => correctByQuestion.has(a.questionId))
      .map((a) => {
        const isCorrect = correctByQuestion.get(a.questionId) === a.selectedIndex;
        if (isCorrect) correctCount++;
        return { ...a, isCorrect };
      });

    const score = Math.round((correctCount / questions.length) * 10000) / 100;
    const passed = score >= training.passingScore;

    const result = await this.dataSource.transaction(async (mgr) => {
      // Numbering continues past superseded history: those rows are retained
      // for audit and still hold their attempt_numbers, so restarting at 1
      // after a reset would violate the (volunteer, training, n) uniqueness.
      // The BR-03 cap, by contrast, counts only non-superseded attempts.
      const [{ next }] = await mgr.query(
        `SELECT COALESCE(MAX(attempt_number), 0)::int + 1 AS next
         FROM training_attempts WHERE volunteer_id = $1 AND training_id = $2`,
        [volunteer.id, trainingId],
      );
      const attemptNumber = Number(next);

      const expiryDate =
        passed && training.expiryMonths
          ? new Date(new Date().setMonth(new Date().getMonth() + training.expiryMonths))
              .toISOString()
              .slice(0, 10)
          : null;

      const attempt = await mgr.save(
        mgr.create(TrainingAttempt, {
          volunteerId: volunteer.id,
          trainingId,
          attemptNumber,
          scorePercent: String(score),
          correctCount,
          questionCount: questions.length,
          passed,
          contentVersion: training.contentVersion,
          expiryDate,
        }),
      );

      for (const g of graded) {
        await mgr.save(
          mgr.create(TrainingAttemptAnswer, {
            attemptId: attempt.id,
            questionId: g.questionId,
            selectedIndex: g.selectedIndex,
            isCorrect: g.isCorrect,
          }),
        );
      }

      // BR-14 — a pass may complete the compliance set and flip the phase.
      await mgr.query('SELECT fn_recompute_volunteer_phase($1)', [volunteer.id]);
      return { attempt, attemptNumber };
    });

    const usedForCap = await this.usedAttempts(volunteer.id, trainingId);
    const remaining =
      training.maxAttempts === null ? null : Math.max(0, training.maxAttempts - usedForCap);

    // The review reveals the correct answers — after grading, never before.
    const review = await this.detail(trainingId, true);

    return {
      attemptNumber: result.attemptNumber,
      score,
      correctCount,
      questionCount: questions.length,
      passed,
      expiryDate: result.attempt.expiryDate,
      remainingAttempts: passed ? null : remaining,
      review: review.questions.map((q) => ({
        ...q,
        selectedIndex: graded.find((g) => g.questionId === q.id)?.selectedIndex ?? null,
      })),
    };
  }

  private async assertMayAttempt(volunteer: Volunteer, training: Training): Promise<void> {
    // BR-02
    const [compliance] = await this.dataSource.query(
      'SELECT consent_complete FROM v_volunteer_compliance WHERE volunteer_id = $1',
      [volunteer.id],
    );
    if (!compliance?.consent_complete) throw BusinessErrors.consentRequired();

    // A currently valid pass needs no retake.
    const [valid] = await this.dataSource.query(
      'SELECT 1 FROM v_valid_training_passes WHERE volunteer_id = $1 AND training_id = $2',
      [volunteer.id, training.id],
    );
    if (valid) {
      throw new BusinessException('ALREADY_PASSED', 'You already hold a valid pass for this training.', 409);
    }

    // BR-03
    if (training.maxAttempts !== null) {
      const used = await this.usedAttempts(volunteer.id, training.id);
      if (used >= training.maxAttempts) {
        throw BusinessErrors.attemptsExhausted(training.maxAttempts);
      }
    }
  }

  private async usedAttempts(
    volunteerId: string,
    trainingId: string,
    mgr?: { query: (sql: string, params: unknown[]) => Promise<Array<{ n: number }>> },
  ): Promise<number> {
    const runner = mgr ?? this.dataSource;
    const [{ n }] = await runner.query(
      `SELECT COUNT(*)::int AS n FROM training_attempts
       WHERE volunteer_id = $1 AND training_id = $2 AND is_superseded = FALSE`,
      [volunteerId, trainingId],
    );
    return Number(n);
  }

  // ── Admin assessments (BR-12) ──────────────────────────────────────────────

  async assessments(trainingId: string, status?: string) {
    const training = await this.trainings.findOneBy({ id: trainingId });
    if (!training) throw new NotFoundException('Training not found');

    const rows = await this.dataSource.query(
      `SELECT v.id AS volunteer_id, v.first_name, v.last_name, u.email,
              COUNT(a.id) FILTER (WHERE a.is_superseded = FALSE)::int AS attempts_used,
              ARRAY_AGG(a.score_percent ORDER BY a.attempted_at)
                FILTER (WHERE a.is_superseded = FALSE) AS scores,
              vtp.attempt_id IS NOT NULL AS currently_passed,
              vtp.expiry_date
       FROM volunteers v
       JOIN users u ON u.id = v.user_id
       LEFT JOIN training_attempts a
         ON a.volunteer_id = v.id AND a.training_id = $1
       LEFT JOIN v_valid_training_passes vtp
         ON vtp.volunteer_id = v.id AND vtp.training_id = $1
       GROUP BY v.id, u.email, vtp.attempt_id, vtp.expiry_date
       HAVING COUNT(a.id) FILTER (WHERE a.is_superseded = FALSE) > 0
       ORDER BY v.first_name`,
      [trainingId],
    );

    const maxAttempts = training.maxAttempts;
    const mapped = rows.map((r: Record<string, unknown>) => {
      const attemptsUsed = Number(r.attempts_used);
      const passed = r.currently_passed === true;
      const exhausted = !passed && maxAttempts !== null && attemptsUsed >= maxAttempts;
      return {
        volunteerId: r.volunteer_id,
        name: `${r.first_name} ${r.last_name}`,
        email: r.email,
        attemptsUsed,
        maxAttempts,
        scores: (r.scores as string[] | null)?.map(Number) ?? [],
        passed,
        exhausted,
        expiryDate: r.expiry_date,
      };
    });

    if (status === 'passed') return mapped.filter((m: { passed: boolean }) => m.passed);
    if (status === 'failed') return mapped.filter((m: { passed: boolean; exhausted: boolean }) => !m.passed && !m.exhausted);
    if (status === 'exhausted') return mapped.filter((m: { exhausted: boolean }) => m.exhausted);
    return mapped;
  }

  /** BR-12: supersede, never delete — a POCSO audit that can be erased is not an audit. */
  async resetAttempts(
    principal: AuthPrincipal,
    trainingId: string,
    volunteerId: string,
    reason?: string,
    triggeredByContentChange = false,
  ) {
    const cleared = await this.dataSource.transaction(async (mgr) => {
      const { affected } = await mgr.update(
        TrainingAttempt,
        { trainingId, volunteerId, isSuperseded: false },
        { isSuperseded: true },
      );
      await mgr.save(
        mgr.create(TrainingAttemptReset, {
          trainingId,
          volunteerId,
          attemptsCleared: affected ?? 0,
          reason: reason ?? null,
          triggeredByContentChange,
          resetBy: principal.sub,
        }),
      );
      // Losing a compliance pass can demote the phase.
      await mgr.query('SELECT fn_recompute_volunteer_phase($1)', [volunteerId]);
      return affected ?? 0;
    });

    await this.audit.record(principal, {
      action: 'assessment.reset',
      entity: 'training_attempts',
      entityId: trainingId,
      after: { volunteerId, cleared, reason, triggeredByContentChange },
    });

    return { cleared };
  }

  /** The "new document added — reset everyone?" decision on mandatory trainings. */
  async resetAllForTraining(principal: AuthPrincipal, trainingId: string, reason?: string) {
    const volunteerIds: Array<{ volunteer_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT volunteer_id FROM training_attempts
       WHERE training_id = $1 AND is_superseded = FALSE`,
      [trainingId],
    );
    let total = 0;
    for (const { volunteer_id } of volunteerIds) {
      const { cleared } = await this.resetAttempts(
        principal,
        trainingId,
        volunteer_id,
        reason ?? 'Training materials updated',
        true,
      );
      total += cleared;
    }
    return { volunteers: volunteerIds.length, attemptsCleared: total };
  }
}
