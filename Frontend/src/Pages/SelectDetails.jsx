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
    sessionStorage.setItem("academicDetails", JSON.stringify(formData));
    navigate("/setup-questions");
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
