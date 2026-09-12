import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, FileCheck2, ClipboardEdit } from 'lucide-react';
import PageTransition from '../components/ui/PageTransition';
import EmptyState from '../components/ui/EmptyState';
import { Badge } from '../components/ui/badge';
import { usePageHeader } from '../context/PageHeaderContext';
import { fetchMyExamAssignments } from '../Api/examinationApi';

const RESPONSIBILITY_LABEL = {
  PAPER_REVIEWER: 'Question Paper Review',
  PAPER_VERIFIER: 'Question Paper Verification',
  PAPER_APPROVER: 'Question Paper Approval',
  MARKS_ENTRY: 'Marks Entry',
  EVALUATOR: 'Evaluation',
  MODERATOR: 'Moderation',
};

export default function MyExaminationsPage() {
  usePageHeader({ title: 'My Assigned Examinations', subtitle: 'Question papers and marks-entry work assigned to you' });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetchMyExamAssignments()
      .then((res) => setRows(res.data?.data || []))
      .catch((err) => toast.error(err.response?.data?.message || 'Could not load your assignments.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <PageTransition><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div></PageTransition>;
  }

  if (rows.length === 0) {
    return (
      <PageTransition>
        <EmptyState icon={FileCheck2} title="No assigned examinations" description="When the Examination Cell assigns you a question paper to review or a class to enter marks for, it will appear here." />
      </PageTransition>
    );
  }

  const isReviewResponsibility = (r) => ['PAPER_REVIEWER', 'PAPER_VERIFIER', 'PAPER_APPROVER'].includes(r);

  return (
    <PageTransition className="space-y-4">
      {rows.map((a) => (
        <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-foreground">{a.subject_name} <span className="font-normal text-muted-foreground">({a.course_code})</span></h3>
              <p className="mt-0.5 text-sm text-muted-foreground">{a.exam_type}{a.paper_set ? ` · ${a.paper_set}` : ''} · {a.academic_year}</p>
              <p className="mt-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">My Responsibility</p>
              <p className="text-sm font-semibold text-foreground">{RESPONSIBILITY_LABEL[a.responsibility] || a.responsibility}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge variant="secondary">{a.paper_status?.replace(/_/g, ' ')}</Badge>
              {a.responsibility === 'MARKS_ENTRY' && a.marks_status && (
                <Badge className="bg-sky-500/15 text-sky-600">{a.marks_status.replace(/_/g, ' ')}</Badge>
              )}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {isReviewResponsibility(a.responsibility) && (
              <button type="button" onClick={() => navigate(`/examinations/papers/${a.question_paper_id}`)} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <ClipboardEdit className="h-4 w-4" /> Review Question Paper
              </button>
            )}
            {a.responsibility === 'MARKS_ENTRY' && (
              <button
                type="button"
                onClick={() => (a.paper_status === 'APPROVED' ? navigate(`/courses/${a.course_id}?tab=marks`) : navigate(`/examinations/papers/${a.question_paper_id}`))}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <FileCheck2 className="h-4 w-4" /> {a.paper_status === 'APPROVED' ? 'Enter Marks' : 'View Paper Status'}
              </button>
            )}
          </div>
        </div>
      ))}
    </PageTransition>
  );
}
