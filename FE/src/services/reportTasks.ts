import type { ReportCategory, ReportSnapshot } from '../api/reports';

// 현장직원이 올린 보고를 관리자가 읽고 확인해야 할 항목을 만든다.
// 본문 문장을 그대로 옮기지 않고, 서버가 함께 주는 집계 값(generation_snapshot)에서
// 확인이 필요한 사실만 골라 점검 항목 문장으로 바꾼다.
const DEFECT_RATE_LIMIT = 3; // 품질 화면과 같은 불량률 관리 기준(%)
const MAX_TASKS = 5;

const categoryTask: Record<ReportCategory, string> = {
  equipment_issue: '이상 설비의 현재 상태와 안전 조치 확인',
  quality_report: '재발 방지 조치를 인수인계 노트에 기록했는지 확인',
  inspection_done: '점검 후 미조치 항목의 후속 일정 확인',
  periodic_weekly: '지난주 대비 변동 원인 확인',
  periodic_monthly: '지난달 대비 변동 원인 확인',
  other: '보고 내용을 담당자와 공유하고 후속 조치 정리',
};

function snapshotTasks(snapshot: ReportSnapshot): string[] {
  const tasks: string[] = [];

  if (snapshot.productionRecordCount === 0) {
    tasks.push('생산 기록이 없는 사유(휴무·설비 정지·입력 누락) 확인');
  }
  if (snapshot.inspectedCount === 0) {
    tasks.push('검사 미실시 사유와 검사 계획 확인');
  }
  if (snapshot.defectCount > 0) {
    const types = snapshot.defectTypes.length ? `(${snapshot.defectTypes.join(', ')})` : '';
    tasks.push(`불량 ${snapshot.defectCount}건${types}의 원인과 조치 결과 확인`);
  }
  if (snapshot.defectRatePercent !== null && snapshot.defectRatePercent >= DEFECT_RATE_LIMIT) {
    tasks.push(`불량률 ${snapshot.defectRatePercent}%가 관리 기준 이내인지 확인`);
  }
  if (snapshot.includesDemo) {
    tasks.push('시연 데이터가 포함된 집계인지 확인');
  }
  if (snapshot.targetCount === 0) {
    tasks.push('대상 부서·설비·라인 범위가 의도와 맞는지 확인');
  } else if (snapshot.equipmentCount === 0) {
    tasks.push('요청한 설비가 집계에 포함되지 않은 이유 확인');
  }
  if (!snapshot.periodFrom || !snapshot.periodTo) {
    tasks.push('집계 기간 설정이 의도와 맞는지 확인');
  }

  return tasks;
}

export interface ReportTaskSet {
  items: string[];
  /** 집계 값에서 확인 항목을 만들었는지, 유형별 기본 항목을 썼는지 */
  fromSnapshot: boolean;
}

export function reportTasks(report: {
  category: ReportCategory;
  generation_snapshot: ReportSnapshot | null;
}): ReportTaskSet {
  const snapshot = report.generation_snapshot;
  if (snapshot) {
    const items = [...snapshotTasks(snapshot), categoryTask[report.category]];
    const unique = [...new Set(items)];
    if (unique.length) return { items: unique.slice(0, MAX_TASKS), fromSnapshot: true };
  }
  return { items: [categoryTask[report.category]], fromSnapshot: false };
}
