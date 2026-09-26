import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  FeedbackSurvey,
  FeedbackQuestion,
  FeedbackResponse,
  FeedbackStakeholderType,
  NaacMetric14Report,
} from '../../types/index.js';

export interface CreateSurveyRequest {
  offeringId?: string;
  courseId?: string;
  academicYear: string;
  semester?: number;
  stakeholderType: FeedbackStakeholderType;
  title: string;
  questions: Array<{ questionText: string; category: 'CURRICULUM' | 'PEDAGOGY' | 'COURSE_OUTCOMES' | 'FACILITIES' }>;
}

export interface SubmitFeedbackRequest {
  surveyId: string;
  respondentId?: string;
  ratings: Record<string, number>; // questionId -> 1 to 5 Likert score
  comments?: string;
}

export class FeedbackService {
  /**
   * Create a new Likert feedback survey with structured questions
   */
  createSurvey(req: CreateSurveyRequest): { survey: FeedbackSurvey; questions: FeedbackQuestion[] } {
    if (!req.questions || req.questions.length === 0) {
      throw new Error('Survey must contain at least one question');
    }

    const surveyId = `survey-${crypto.randomUUID()}`;
    const survey: FeedbackSurvey = {
      id: surveyId,
      offeringId: req.offeringId,
      courseId: req.courseId,
      academicYear: req.academicYear,
      semester: req.semester,
      stakeholderType: req.stakeholderType,
      title: req.title,
      status: 'ACTIVE',
      createdAt: new Date(),
    };

    db.feedbackSurveys.set(surveyId, survey);

    const createdQuestions: FeedbackQuestion[] = [];
    for (const q of req.questions) {
      const questionId = `q-${crypto.randomUUID()}`;
      const question: FeedbackQuestion = {
        id: questionId,
        surveyId,
        questionText: q.questionText,
        category: q.category,
      };
      db.feedbackQuestions.set(questionId, question);
      createdQuestions.push(question);
    }

    return { survey, questions: createdQuestions };
  }

  /**
   * Close an active feedback survey
   */
  closeSurvey(surveyId: string): FeedbackSurvey {
    const survey = db.feedbackSurveys.get(surveyId);
    if (!survey) {
      throw new Error(`Survey not found: ${surveyId}`);
    }
    survey.status = 'CLOSED';
    return survey;
  }

  /**
   * Submit 5-point Likert ratings for a survey
   * Enforces 1-5 rating range per NAAC / UGC criteria
   */
  submitResponse(req: SubmitFeedbackRequest): FeedbackResponse {
    const survey = db.feedbackSurveys.get(req.surveyId);
    if (!survey) {
      throw new Error(`Survey not found: ${req.surveyId}`);
    }

    if (survey.status !== 'ACTIVE') {
      throw new Error(`Survey is closed or inactive: ${req.surveyId}`);
    }

    if (!req.ratings || Object.keys(req.ratings).length === 0) {
      throw new Error('Feedback submission must contain at least one rating');
    }

    // Validate 1-5 Likert range and question ownership
    for (const [qId, rating] of Object.entries(req.ratings)) {
      const q = db.feedbackQuestions.get(qId);
      if (!q || q.surveyId !== req.surveyId) {
        throw new Error(`Invalid question ID for survey ${req.surveyId}: ${qId}`);
      }

      if (typeof rating !== 'number' || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        throw new Error(`Invalid Likert rating for question ${qId}: must be an integer between 1 and 5 (got ${rating})`);
      }
    }

    const responseId = `resp-${crypto.randomUUID()}`;
    const response: FeedbackResponse = {
      id: responseId,
      surveyId: req.surveyId,
      respondentId: req.respondentId ? crypto.createHash('sha256').update(req.respondentId).digest('hex').substring(0, 16) : undefined,
      ratings: req.ratings,
      comments: req.comments,
      submittedAt: new Date(),
    };

    db.feedbackResponses.set(responseId, response);
    return response;
  }

  /**
   * Compute NAAC Metric 1.4: Institutional Feedback System & Analysis
   * Analyzes feedback across students, teachers, employers, and alumni.
   */
  computeNaacMetric14(academicYear: string = '2025-2026'): NaacMetric14Report {
    const surveysForYear = Array.from(db.feedbackSurveys.values()).filter(
      (s) => s.academicYear === academicYear
    );
    const surveyIds = new Set(surveysForYear.map((s) => s.id));

    const responses = Array.from(db.feedbackResponses.values()).filter((r) =>
      surveyIds.has(r.surveyId)
    );

    const stakeholderCounts: Record<FeedbackStakeholderType, { count: number; totalRating: number; ratingCount: number }> = {
      STUDENT: { count: 0, totalRating: 0, ratingCount: 0 },
      TEACHER: { count: 0, totalRating: 0, ratingCount: 0 },
      ALUMNI: { count: 0, totalRating: 0, ratingCount: 0 },
      EMPLOYER: { count: 0, totalRating: 0, ratingCount: 0 },
    };

    const categoryScores: Record<string, { total: number; count: number }> = {};

    let grandTotalRating = 0;
    let grandRatingCount = 0;
    let positiveRatingsCount = 0; // rating >= 4

    for (const resp of responses) {
      const survey = db.feedbackSurveys.get(resp.surveyId)!;
      const sh = survey.stakeholderType;
      stakeholderCounts[sh].count++;

      for (const [qId, rating] of Object.entries(resp.ratings)) {
        grandTotalRating += rating;
        grandRatingCount++;
        stakeholderCounts[sh].totalRating += rating;
        stakeholderCounts[sh].ratingCount++;

        if (rating >= 4) {
          positiveRatingsCount++;
        }

        const q = db.feedbackQuestions.get(qId);
        const cat = q?.category || 'CURRICULUM';
        if (!categoryScores[cat]) {
          categoryScores[cat] = { total: 0, count: 0 };
        }
        categoryScores[cat].total += rating;
        categoryScores[cat].count++;
      }
    }

    const averageLikertScore =
      grandRatingCount > 0
        ? Math.round((grandTotalRating / grandRatingCount) * 100) / 100
        : 0; // 0 if empty

    const satisfactionPercentage =
      grandRatingCount > 0
        ? Math.round((positiveRatingsCount / grandRatingCount) * 10000) / 100
        : 0;

    const stakeholderBreakdown: Record<FeedbackStakeholderType, { count: number; avgRating: number }> = {
      STUDENT: {
        count: stakeholderCounts.STUDENT.count,
        avgRating: stakeholderCounts.STUDENT.ratingCount > 0
          ? Math.round((stakeholderCounts.STUDENT.totalRating / stakeholderCounts.STUDENT.ratingCount) * 100) / 100
          : 0,
      },
      TEACHER: {
        count: stakeholderCounts.TEACHER.count,
        avgRating: stakeholderCounts.TEACHER.ratingCount > 0
          ? Math.round((stakeholderCounts.TEACHER.totalRating / stakeholderCounts.TEACHER.ratingCount) * 100) / 100
          : 0,
      },
      ALUMNI: {
        count: stakeholderCounts.ALUMNI.count,
        avgRating: stakeholderCounts.ALUMNI.ratingCount > 0
          ? Math.round((stakeholderCounts.ALUMNI.totalRating / stakeholderCounts.ALUMNI.ratingCount) * 100) / 100
          : 0,
      },
      EMPLOYER: {
        count: stakeholderCounts.EMPLOYER.count,
        avgRating: stakeholderCounts.EMPLOYER.ratingCount > 0
          ? Math.round((stakeholderCounts.EMPLOYER.totalRating / stakeholderCounts.EMPLOYER.ratingCount) * 100) / 100
          : 0,
      },
    };

    const categoryBreakdown: Record<string, number> = {};
    for (const [cat, data] of Object.entries(categoryScores)) {
      categoryBreakdown[cat] = data.count > 0 ? Math.round((data.total / data.count) * 100) / 100 : 0;
    }

    const report: NaacMetric14Report = {
      academicYear,
      totalResponses: responses.length,
      averageLikertScore,
      satisfactionPercentage,
      stakeholderBreakdown,
      categoryBreakdown,
      naacMetric1_4_Compliant: responses.length >= 10 && averageLikertScore >= 3.5,
    };

    // Cache in naacTelemetryCache for Criterion 1 Metric 1.4
    db.naacCache.set(`naac-1.4-${academicYear}`, {
      academicYear,
      criterionNumber: 1,
      metricCode: '1.4.1_1.4.2_FEEDBACK_SYSTEM',
      computedData: report as unknown as Record<string, unknown>,
      lastComputedAt: new Date(),
    });

    return report;
  }
}

export const feedbackService = new FeedbackService();
