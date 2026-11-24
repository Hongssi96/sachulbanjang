from dataclasses import dataclass

from app.models.conversation import AnswerEvidence
from app.models.master import AppUser
from app.repositories.conversation import ReportAccess

ANSWER_AVAILABLE = "available"
ANSWER_HIDDEN = "hidden_permission"
ANSWER_WITH_DELETED_EVIDENCE = "available_with_deleted_evidence"

DeletedSources = tuple[set[int], set[int], set[int]]


@dataclass(frozen=True)
class AnswerVisibility:
    status: str
    evidence: list[AnswerEvidence]


def compute_answer_visibility(
    owner: AppUser,
    evidence: list[AnswerEvidence],
    report_access: dict[int, ReportAccess],
    deleted_sources: DeletedSources,
) -> AnswerVisibility:
    """Hide answers whose report evidence is no longer readable by the owner.

    Deleted evidence keeps its answer but is marked so the screen can say the
    answer is a past reference. Missing permission takes precedence and removes
    both the answer text and its evidence from the response.
    """
    deleted_process, deleted_inspection, deleted_product = deleted_sources
    hidden = False
    deleted = False
    for item in evidence:
        if item.report_id is not None:
            access = report_access.get(item.report_id)
            if access is None:
                deleted = True
            else:
                if owner.role != "admin" and access.author_id != owner.id:
                    hidden = True
                if access.deleted:
                    deleted = True
        if item.process_record_id in deleted_process:
            deleted = True
        if item.inspection_record_id in deleted_inspection:
            deleted = True
        if item.product_id in deleted_product:
            deleted = True
    if hidden:
        return AnswerVisibility(status=ANSWER_HIDDEN, evidence=[])
    if deleted:
        return AnswerVisibility(status=ANSWER_WITH_DELETED_EVIDENCE, evidence=evidence)
    return AnswerVisibility(status=ANSWER_AVAILABLE, evidence=evidence)
