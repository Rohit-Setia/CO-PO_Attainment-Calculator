import React from 'react';
import { Upload, Users, Loader2, Save, Plus, HelpCircle } from 'lucide-react';
import StudentTable from '../StudentTable';
import QuestionWiseTable from '../QuestionWiseTable';

export default function MarksTab({
  course,
  students,
  setStudents,
  activeExamType,
  setActiveExamType,
  entryMode,
  setEntryMode,
  questions,
  setQuestions,
  numQuestionsInput,
  setNumQuestionsInput,
  handleExcelUpload,
  saving,
  saveMarksList,
  updateMark,
  updateQuestionConfig,
  updateStudentInfo,
  removeStudent,
  addStudentRow
}) {
  return (
    <div className="space-y-6">
      
      {/* Top controls: Component selection and Entry Mode selector */}
      <div className="grid gap-6 md:grid-cols-4">
        
        {/* Component Selector */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
          <h4 className="font-bold text-base text-slate-200 border-b border-slate-700/50 pb-2">Exam Component</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setActiveExamType('MTT')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                activeExamType === 'MTT'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              MTT (Internal)
            </button>
            <button
              type="button"
              onClick={() => setActiveExamType('ETT')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                activeExamType === 'ETT'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              ETT (External)
            </button>
          </div>
        </div>

        {/* Data Entry Mode Selector */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4">
          <h4 className="font-bold text-base text-slate-200 border-b border-slate-700/50 pb-2">Data Entry Mode</h4>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEntryMode('co')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                entryMode === 'co'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Direct CO-Wise
            </button>
            <button
              type="button"
              onClick={() => setEntryMode('question')}
              className={`py-2 px-3 rounded-xl border text-xs font-semibold transition ${
                entryMode === 'question'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              Question-Wise
            </button>
          </div>
        </div>

        {/* Question Wise config fields (Visible only in question mode) */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-4 md:col-span-2">
          {entryMode === 'question' ? (
            <>
              <h4 className="font-bold text-base text-slate-200 border-b border-slate-700/50 pb-2">Questions Count</h4>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={numQuestionsInput}
                  onChange={(e) => {
                    const valStr = e.target.value;
                    setNumQuestionsInput(valStr);
                    const val = parseInt(valStr);
                    if (!isNaN(val) && val >= 1 && val <= 30) {
                      // Adjust questions count
                      setQuestions(prev => {
                        if (prev.length === val) return prev;
                        if (prev.length < val) {
                          const added = Array.from({ length: val - prev.length }, (_, i) => ({
                            id: prev.length + i + 1,
                            label: `Q${prev.length + i + 1}`,
                            co: 'co1',
                            maxMarks: 10
                          }));
                          return [...prev, ...added];
                        } else {
                          return prev.slice(0, val);
                        }
                      });
                    }
                  }}
                  className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-blue-400 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-slate-400">(Specify questions count from 1 to 30)</span>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-xs italic gap-1.5 py-2">
              <HelpCircle className="h-4 w-4 text-slate-600" />
              Direct mode inputs totals per CO column directly.
            </div>
          )}
        </div>
      </div>

      {/* Main spreadsheet interface card */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
          <div>
            <h4 className="font-bold text-lg text-slate-100">
              {activeExamType === 'MTT' ? 'MTT Assessment Grades Sheet' : 'End-Sem ETT Grades Sheet'}
            </h4>
            <p className="text-xs text-slate-400">
              Configure question layouts, input marks per column, or upload Excel spreadsheets to populate.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/30 hover:bg-slate-800 text-xs font-semibold text-slate-200 cursor-pointer transition">
              <Upload className="h-3.5 w-3.5" /> Import Excel
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleExcelUpload} 
                className="hidden" 
              />
            </label>
            <button
              onClick={addStudentRow}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-xs font-semibold text-blue-400 transition"
            >
              <Plus className="h-3.5 w-3.5" /> Add Student Row
            </button>
            <button
              onClick={saveMarksList}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save All Grades
            </button>
          </div>
        </div>

        {/* Data list view */}
        {students.length === 0 ? (
          <div className="py-20 text-center text-slate-500 space-y-3">
            <Users className="h-10 w-10 text-slate-600 mx-auto" />
            <p className="text-sm">No student rows populated yet. Add rows manually or import via Excel.</p>
          </div>
        ) : entryMode === 'question' ? (
          <div className="overflow-x-auto">
            <QuestionWiseTable
              students={students}
              questions={questions}
              updateMark={updateMark}
              updateQuestionConfig={updateQuestionConfig}
              updateStudentInfo={updateStudentInfo}
              removeStudent={removeStudent}
            />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700/50">
            {/* Convert coMax config keys to map to StudentTable */}
            <StudentTable
              students={students}
              updateMark={updateMark}
              coMax={{
                co1: config ? config.co1_max_internal : 10,
                co2: config ? config.co2_max_internal : 10,
                co3: config ? config.co3_max_internal : 10,
                co4: config ? config.co4_max_internal : 15,
                co5: config ? config.co5_max_internal : 15,
                co6: config ? config.co6_max_internal : 10,
              }}
            />
          </div>
        )}
      </div>

    </div>
  );
}
