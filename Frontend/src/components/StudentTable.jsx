import React from "react";
import { Input } from "@/components/ui/input";
import { COS, calcCoPercent } from "@/utils/calculations";

export default function StudentTable({ students, updateMark, coMax }) {
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
          </tr>
        </thead>

        <tbody>
          {students.map((s, i) => (
            <tr key={s.roll || i}>
              <td>{s.serialNo}</td>
              <td>{s.roll}</td>
              <td>{s.name}</td>
              <td>{s.totalMarks}</td>

              {COS.map((co) => (
                <td key={co}>
                  <Input
                    type="number"
                    value={s[co] || 0}
                    onChange={(e) => updateMark(i, co, e.target.value)}
                    className="w-20"
                  />
                </td>
              ))}
              {COS.map((co,index) => (
                <td key={co + "percent"} className={index === 0 ? "border-l-2 border-gray-300 bg-gray-50" : "bg-gray-50"}>
                  {calcCoPercent(s[co], coMax[co])}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
