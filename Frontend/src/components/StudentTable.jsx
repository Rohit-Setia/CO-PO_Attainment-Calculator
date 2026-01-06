import React from "react";
import { Input } from "@/components/ui/input";
import { COS, calcCoPercent } from "@/utils/calculations";

export default function StudentTable({ students, updateMark, coMax }) {
  return (
    <div className="overflow-x-auto">
      <table className="border w-full text-sm">
        <thead>
          <tr>
            <th>Sr</th>
            <th>Reg</th>
            <th>Name</th>
            <th>Total</th>
            {COS.map((c) => (
              <React.Fragment key={c}>
                <th>{c.toUpperCase()}</th>
                <th>{c.toUpperCase()}%</th>
              </React.Fragment>
            ))}
            {/* <th>Overall %</th> */}
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
                <React.Fragment key={co}>
                  <td>
                    <Input
                      type="number"
                      value={s[co] || 0}
                      onChange={(e) => updateMark(i, co, e.target.value)}
                      className="w-20"
                    />
                  </td>
                  <td>{calcCoPercent(s[co], coMax[co])}%</td>
                </React.Fragment>
              ))}

              <td>{s.percentage || 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
