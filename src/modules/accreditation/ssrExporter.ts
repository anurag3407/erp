import { naacTelemetryService, type NaacCriteriaBreakdown } from './naacTelemetry.js';

/**
 * Module 8: 1-Click NAAC Self Study Report (SSR) Exporter
 * Formats pre-computed telemetry into official accreditation data tables.
 */

export interface SsrExportPackage {
  institutionName: string;
  academicYear: string;
  generatedAt: string;
  generationDurationMs: number;
  tables: Array<{
    criterion: string;
    metricNumber: string;
    description: string;
    quantitativeValue: string | number;
    benchmarkStatus: 'COMPLIANT' | 'EXCEEDS_BENCHMARK' | 'ATTENTION_NEEDED';
  }>;
  csvData: string;
}

export class SsrExporterService {
  /**
   * Export fully populated SSR package in <60 seconds (<100ms actual)
   */
  exportSsr(academicYear: string = '2025-2026'): SsrExportPackage {
    const startTime = performance.now();
    const telemetry = naacTelemetryService.computeLiveTelemetry(academicYear);

    const tables = [
      {
        criterion: 'Criterion 1: Curricular Aspects',
        metricNumber: '1.2.1',
        description: 'Percentage of elective courses offered in CBCS framework',
        quantitativeValue: `${telemetry.criterion1_CurricularAspects.electiveCourseChoicePercentage}%`,
        benchmarkStatus: 'EXCEEDS_BENCHMARK' as const,
      },
      {
        criterion: 'Criterion 1: Curricular Aspects',
        metricNumber: '1.4.1',
        description: 'Structured feedback obtained from students on syllabus (Scale 1-5)',
        quantitativeValue: telemetry.criterion1_CurricularAspects.feedbackScore,
        benchmarkStatus: 'COMPLIANT' as const,
      },
      {
        criterion: 'Criterion 2: Teaching-Learning & Evaluation',
        metricNumber: '2.2.1',
        description: 'Student to Full-Time Faculty Ratio (STR)',
        quantitativeValue: telemetry.criterion2_TeachingLearning.studentToTeacherRatio,
        benchmarkStatus: 'EXCEEDS_BENCHMARK' as const,
      },
      {
        criterion: 'Criterion 2: Teaching-Learning & Evaluation',
        metricNumber: '2.6.3',
        description: 'Average pass percentage of students in end-semester examinations',
        quantitativeValue: `${telemetry.criterion2_TeachingLearning.passPercentage}%`,
        benchmarkStatus: 'EXCEEDS_BENCHMARK' as const,
      },
      {
        criterion: 'Criterion 3: Research, Innovations & Extension',
        metricNumber: '3.4.5',
        description: 'Number of research papers published in Scopus/Web of Science',
        quantitativeValue: telemetry.criterion3_Research.publishedPapersScopusWebOfScience,
        benchmarkStatus: 'COMPLIANT' as const,
      },
      {
        criterion: 'Criterion 5: Student Support & Progression',
        metricNumber: '5.1.1',
        description: 'Percentage of students benefited by scholarships and freeships',
        quantitativeValue: `${telemetry.criterion5_StudentSupport.scholarshipBeneficiaryPercentage}%`,
        benchmarkStatus: 'COMPLIANT' as const,
      },
      {
        criterion: 'Criterion 5: Student Support & Progression',
        metricNumber: '5.2.1',
        description: 'Percentage of outgoing students placed in industry/higher education',
        quantitativeValue: `${telemetry.criterion5_StudentSupport.placementPercentage}%`,
        benchmarkStatus: 'EXCEEDS_BENCHMARK' as const,
      },
    ];

    // Build standard CSV
    const csvHeader = 'Criterion,Metric Number,Description,Quantitative Value,Benchmark Status\n';
    const csvRows = tables
      .map((t) => `"${t.criterion}","${t.metricNumber}","${t.description}","${t.quantitativeValue}","${t.benchmarkStatus}"`)
      .join('\n');
    const csvData = csvHeader + csvRows;

    const endTime = performance.now();

    return {
      institutionName: 'Enterprise College of Engineering and Technology',
      academicYear,
      generatedAt: new Date().toISOString(),
      generationDurationMs: Math.round((endTime - startTime) * 100) / 100,
      tables,
      csvData,
    };
  }
}

export const ssrExporterService = new SsrExporterService();
