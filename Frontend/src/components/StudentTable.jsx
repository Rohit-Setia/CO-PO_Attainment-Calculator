import React from "react";
import { Input } from "@/components/ui/input";
import { COS, calcCoPercent, calcOverallPercent } from "@/utils/calculations";

export default function StudentTable({ students, updateMark, onBlurMark, coMax, isReadOnly }) {
  return (
    <div className="overflow-x-auto border border-gray-300 rounded-md overflow-hidden">
      <table className="w-full text-sm [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2">
        <thead className="bg-gray-100">
          <tr>
            <th>Sr</th>
            <th>Reg</th>
            <th>Name</th>
            <th>Total</th>
          {COS.map((c) => (
            <th key={c}>{c.toUpperCase()}</th>
          ))}

          {COS.map((c, index) => (
            <th key={c + "%"} className={index === 0 ? "border-l-2 border-gray-300" : ""}>{c.toUpperCase()}%</th>
          ))}
            <th className="border-l-2 border-gray-300">Overall %</th>
          </tr>
        </thead>

        <tbody>
          {students.map((s, i) => (
            <tr key={s.roll || i}>
              <td>{i + 1}</td>
              <td>{s.roll}</td>
              <td>{s.name}</td>
              <td>{s.totalMarks}</td>

              {COS.map((co) => (
                <td key={co}>
                  <Input
                    type="text"
                    value={s[co] !== undefined && s[co] !== null ? s[co] : ""}
                    onChange={(e) => updateMark(i, co, e.target.value)}
                    onBlur={() => onBlurMark && onBlurMark(i, co)}
                    disabled={isReadOnly}
                    className={`w-20 font-semibold text-center focus:ring-2 focus:ring-blue-500 ${
                      (Number(s[co]) || 0) > (Number(coMax[co]) || 0) ? "border-red-500 text-red-600 bg-red-50" : "bg-white border-slate-200"
                    } ${
                      (Number(s[co]) || 0) < 0 ? "border-red-500 text-red-600 bg-red-50" : ""
                    }`}
                  />
                </td>
              ))}
              {COS.map((co,index) => {
                const percent = calcCoPercent(s[co], coMax[co]);
                return (
                  <td key={co + "percent"} className={index === 0 ? "border-l-2 border-gray-300 bg-gray-50" : "bg-gray-50"}>
                    {percent}%
                  </td>
                );
              })}
              <td className="border-l-2 border-gray-300 bg-gray-50 font-bold">
                {calcOverallPercent(s, coMax) === "--" ? "--" : `${calcOverallPercent(s, coMax)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
