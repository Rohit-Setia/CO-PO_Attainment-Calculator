import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchDepartments,
  fetchPrograms,
  fetchSemesters,
  fetchClassrooms,
  fetchSubjects,
  fetchAssessments
} from "../Api/erpApi";

export default function SelectionPage() {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState("question");
  const [loading, setLoading] = useState({
    departments: false,
    programs: false,
    semesters: false,
    classrooms: false,
    subjects: false,
    assessments: false
  });

  const [options, setOptions] = useState({
    departments: [],
    programs: [],
    semesters: [],
    classrooms: [],
    subjects: [],
    assessments: []
  });

  const [formData, setFormData] = useState({
    departmentId: "",
    programId: "",
    semesterId: "",
    classroomId: "",
    subjectId: "",
    assessmentId: ""
  });

  // Load initial data: departments
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        setLoading(prev => ({ ...prev, departments: true }));
        const res = await fetchDepartments();
        setOptions(prev => ({ ...prev, departments: res.data.data }));
      } catch (err) {
        console.error("Failed to load departments", err);
      } finally {
        setLoading(prev => ({ ...prev, departments: false }));
      }
    };
    loadDepartments();
  }, []);

  // Load programs when department changes
  useEffect(() => {
    if (!formData.departmentId) {
      setOptions(prev => ({ ...prev, programs: [] }));
      return;
    }
    const loadPrograms = async () => {
      try {
        setLoading(prev => ({ ...prev, programs: true }));
        const res = await fetchPrograms();
        setOptions(prev => ({ ...prev, programs: res.data.data.filter(p => p.department_id === Number(formData.departmentId)) }));
      } catch (err) {
        console.error("Failed to load programs", err);
      } finally {
        setLoading(prev => ({ ...prev, programs: false }));
      }
    };
    loadPrograms();
  }, [formData.departmentId]);

  // Load semesters (all active, or filter if needed)
  useEffect(() => {
    const loadSemesters = async () => {
      try {
        setLoading(prev => ({ ...prev, semesters: true }));
        const res = await fetchSemesters();
        setOptions(prev => ({ ...prev, semesters: res.data.data.filter(s => s.status === "Active") }));
      } catch (err) {
        console.error("Failed to load semesters", err);
      } finally {
        setLoading(prev => ({ ...prev, semesters: false }));
      }
    };
    loadSemesters();
  }, []);

  // Load classrooms when program and semester change
  useEffect(() => {
    if (!formData.departmentId || !formData.programId || !formData.semesterId) {
      setOptions(prev => ({ ...prev, classrooms: [] }));
      return;
    }
    const loadClassrooms = async () => {
      try {
        setLoading(prev => ({ ...prev, classrooms: true }));
        const res = await fetchClassrooms();
        setOptions(prev => ({
          ...prev,
          classrooms: res.data.data.filter(c =>
            c.department_id === Number(formData.departmentId) &&
            c.program_id === Number(formData.programId) &&
            c.semester_id === Number(formData.semesterId) &&
            c.status === "Active"
          )
        }));
      } catch (err) {
        console.error("Failed to load classrooms", err);
      } finally {
        setLoading(prev => ({ ...prev, classrooms: false }));
      }
    };
    loadClassrooms();
  }, [formData.departmentId, formData.programId, formData.semesterId]);

  // Load subjects when classroom changes
  useEffect(() => {
    if (!formData.classroomId) {
      setOptions(prev => ({ ...prev, subjects: [] }));
      return;
    }
    const loadSubjects = async () => {
      try {
        setLoading(prev => ({ ...prev, subjects: true }));
        const res = await fetchSubjects();
        const classroom = options.classrooms.find(c => c.id === Number(formData.classroomId));
        if (classroom) {
          setOptions(prev => ({
            ...prev,
            subjects: res.data.data.filter(s => s.id === classroom.subject_id)
          }));
        }
      } catch (err) {
        console.error("Failed to load subjects", err);
      } finally {
        setLoading(prev => ({ ...prev, subjects: false }));
      }
    };
    loadSubjects();
  }, [formData.classroomId, options.classrooms]);

  // Load assessments when subject and classroom change
  useEffect(() => {
    if (!formData.classroomId || !formData.subjectId) {
      setOptions(prev => ({ ...prev, assessments: [] }));
      return;
    }
    const loadAssessments = async () => {
      try {
        setLoading(prev => ({ ...prev, assessments: true }));
        const res = await fetchAssessments(formData.classroomId, formData.subjectId);
        setOptions(prev => ({ ...prev, assessments: res.data.data }));
      } catch (err) {
        console.error("Failed to load assessments", err);
      } finally {
        setLoading(prev => ({ ...prev, assessments: false }));
      }
    };
    loadAssessments();
  }, [formData.classroomId, formData.subjectId]);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      
      // Clear dependent fields
      if (name === "departmentId") {
        updated.programId = "";
        updated.classroomId = "";
        updated.subjectId = "";
        updated.assessmentId = "";
      }
      if (name === "programId") {
        updated.classroomId = "";
        updated.subjectId = "";
        updated.assessmentId = "";
      }
      if (name === "semesterId") {
        updated.classroomId = "";
        updated.subjectId = "";
        updated.assessmentId = "";
      }
      if (name === "classroomId") {
        updated.subjectId = "";
        updated.assessmentId = "";
      }
      if (name === "subjectId") {
        updated.assessmentId = "";
      }
      
      return updated;
    });
  };

  const handleContinue = () => {
    const prevDetailsStr = sessionStorage.getItem("academicDetails");
    let detailsChanged = true;
    if (prevDetailsStr) {
      try {
        const prevDetails = JSON.parse(prevDetailsStr);
        if (
          prevDetails.departmentId === formData.departmentId &&
          prevDetails.programId === formData.programId &&
          prevDetails.semesterId === formData.semesterId &&
          prevDetails.classroomId === formData.classroomId &&
          prevDetails.subjectId === formData.subjectId &&
          prevDetails.assessmentId === formData.assessmentId
        ) {
          detailsChanged = false;
        }
      } catch (e) {
        detailsChanged = true;
      }
    }

    if (detailsChanged) {
      sessionStorage.removeItem("setupStudents");
      sessionStorage.removeItem("coConfiguration");
    }

    // Get selected objects for display
    const selectedDept = options.departments.find(d => d.id === Number(formData.departmentId));
    const selectedProgram = options.programs.find(p => p.id === Number(formData.programId));
    const selectedSemester = options.semesters.find(s => s.id === Number(formData.semesterId));
    const selectedClassroom = options.classrooms.find(c => c.id === Number(formData.classroomId));
    const selectedSubject = options.subjects.find(s => s.id === Number(formData.subjectId));
    const selectedAssessment = options.assessments.find(a => a.id === Number(formData.assessmentId));

    const academicDetails = {
      ...formData,
      departmentName: selectedDept?.name,
      programName: selectedProgram?.name,
      semesterNumber: selectedSemester?.semester_number,
      classroomName: selectedClassroom?.name,
      subjectName: selectedSubject?.name,
      assessmentName: selectedAssessment?.name,
      assessmentType: selectedAssessment?.type,
    };

    sessionStorage.setItem("academicDetails", JSON.stringify(academicDetails));
    if (entryMode === "question") {
      navigate("/setup-questions");
    } else {
      const storedConfig = sessionStorage.getItem("coConfiguration");
      let config = {};
      if (storedConfig) {
        try {
          config = JSON.parse(storedConfig);
        } catch (e) {
          config = {};
        }
      }
      delete config.questions;
      sessionStorage.setItem("coConfiguration", JSON.stringify(config));
      navigate("/student");
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <Card className="w-full max-w-xl shadow-lg">
        <CardContent className="p-6 space-y-4">
          <h1 className="text-2xl font-bold text-center">
            Select Academic Details
          </h1>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Department
            </label>
            <select
              name="departmentId"
              onChange={handleChange}
              value={formData.departmentId}
              disabled={loading.departments}
              className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select Department</option>
              {options.departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.code} - {dept.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Program
            </label>
            <select
              name="programId"
              onChange={handleChange}
              value={formData.programId}
              disabled={!formData.departmentId || loading.programs}
              className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select Program</option>
              {options.programs.map((prog) => (
                <option key={prog.id} value={prog.id}>
                  {prog.code} - {prog.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Semester
            </label>
            <select
              name="semesterId"
              onChange={handleChange}
              value={formData.semesterId}
              disabled={!formData.programId || loading.semesters}
              className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select Semester</option>
              {options.semesters.map((sem) => (
                <option key={sem.id} value={sem.id}>
                  Semester {sem.semester_number} ({sem.academic_year})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Classroom
            </label>
            <select
              name="classroomId"
              onChange={handleChange}
              value={formData.classroomId}
              disabled={!formData.semesterId || loading.classrooms}
              className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select Classroom</option>
              {options.classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Subject
            </label>
            <select
              name="subjectId"
              onChange={handleChange}
              value={formData.subjectId}
              disabled={!formData.classroomId || loading.subjects}
              className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select Subject</option>
              {options.subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.code} - {sub.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Assessment
            </label>
            <select
              name="assessmentId"
              onChange={handleChange}
              value={formData.assessmentId}
              disabled={!formData.subjectId || loading.assessments}
              className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">Select Assessment</option>
              {options.assessments.map((assess) => (
                <option key={assess.id} value={assess.id}>
                  {assess.name} ({assess.type})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 pt-2">
            <label className="block text-xs font-bold text-slate-500 uppercase">
              Select Data Entry Mode
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setEntryMode("question")}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-center transition-all ${
                  entryMode === "question"
                    ? "border-blue-600 bg-blue-50/50 text-blue-700 font-semibold"
                    : "border-slate-200 hover:border-slate-300 text-slate-600"
                }`}
              >
                <span className="text-sm font-bold">Question-Wise</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Enter marks per question</span>
              </button>
              <button
                type="button"
                onClick={() => setEntryMode("co")}
                className={`flex flex-col items-center justify-center p-3 rounded-lg border-2 text-center transition-all ${
                  entryMode === "co"
                    ? "border-blue-600 bg-blue-50/50 text-blue-700 font-semibold"
                    : "border-slate-200 hover:border-slate-300 text-slate-600"
                }`}
              >
                <span className="text-sm font-bold">CO-Wise</span>
                <span className="text-[10px] text-slate-400 mt-0.5">Enter CO totals directly</span>
              </button>
            </div>
          </div>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={handleContinue}
            disabled={
                !formData.departmentId ||
                !formData.programId ||
                !formData.semesterId ||
                !formData.classroomId ||
                !formData.subjectId ||
                !formData.assessmentId
              }
          >
            Continue to Calculator →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
