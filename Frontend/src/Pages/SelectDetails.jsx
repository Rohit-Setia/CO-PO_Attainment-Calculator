import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const academicStructure = {
  Engineering: {
    departments: ["CSE", "Mechanical"],
    subjects: {
      CSE: ["DSA", "DBMS"],
      Mechanical: ["Thermodynamics", "Fluid Mechanics"],
    },
  },
  Management: {
    departments: ["BBA", "MBA"],
    subjects: {
      BBA: ["Accounting", "Marketing"],
      MBA: ["Finance", "HR"],
    },
  },
};

export default function SelectionPage() {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState("question");

  const [formData, setFormData] = useState({
    school: "",
    department: "",
    subject: "",
    examType: "",
    semester: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (name === "school") {
        updated.department = "";
        updated.subject = "";
      }
      if (name === "department") {
        updated.subject = "";
      }
      if (name === "school") {
        updated.department = "";
        updated.subject = "";
        updated.semester = "";
        updated.examType = "";
      }
      if (name === "department") {
        updated.subject = "";
        updated.semester = "";
        updated.examType = "";
      }
      if (name === "subject") {
        updated.semester = "";
        updated.examType = "";
      }
      
      if (name === "semester") {
        updated.examType = "";
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
          prevDetails.school === formData.school &&
          prevDetails.department === formData.department &&
          prevDetails.subject === formData.subject &&
          prevDetails.semester === formData.semester &&
          prevDetails.examType === formData.examType
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

    sessionStorage.setItem("academicDetails", JSON.stringify(formData));
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

          <select
            name="school"
            onChange={handleChange}
            value={formData.school}
            className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select School</option>
            {Object.keys(academicStructure).map((school) => (
              <option key={school} value={school}>
                {school}
              </option>
            ))}
          </select>

          <select
            name="department"
            onChange={handleChange}
            value={formData.department}
            disabled={!formData.school}
            className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select Department</option>
            {formData.school &&
              academicStructure[formData.school].departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
          </select>

          <select
            name="subject"
            onChange={handleChange}
            value={formData.subject}
            disabled={!formData.department}
            className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select Subject</option>
            {formData.school &&
              formData.department &&
              academicStructure[formData.school].subjects[
                formData.department
              ]?.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
          </select>

          <select
            name="semester"
            onChange={handleChange}
            value={formData.semester}
            disabled={!formData.subject}
            className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select Semester</option>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((sem) => (
                <option key={sem} value={sem}>
                Semester {sem}
                </option>
            ))}
          </select>

          <select
            name="examType"
            onChange={handleChange}
            value={formData.examType}
            disabled={!formData.semester}
            className="w-full border p-2 rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">Select Exam Type</option>
            <option value="MTT">MTT</option>
            <option value="ETT">ETT</option>
          </select>

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
                !formData.school ||
                !formData.department ||
                !formData.subject ||
                !formData.examType ||
                !formData.semester
              }
          >
            Continue to Calculator →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
