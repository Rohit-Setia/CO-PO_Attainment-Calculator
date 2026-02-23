import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AttainmentResults({ results, isLoading }) {
  if (!results) return null;

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-xl text-center">
          CO Attainment Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="py-3 px-6 bg-muted rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold">{results.totalStudents}</div>
            <div className="text-md text-gray-600 mt-1">
              Total Students Present
            </div>
          </div>

          <div className="py-3 px-6 bg-muted rounded-lg text-center shadow-sm">
            <div className="text-2xl font-bold">{results.CO}</div>
            <div className="text-md text-gray-600 mt-1">CO</div>
          </div>
        </div>

        <div className="border border-gray-300 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-sm font-semibold">
              <tr>
                <th className="text-left px-4 py-2">CO</th>
                <th className="text-center px-4 py-2">
                  Students Above Threshold
                </th>
                <th className="text-center px-4 py-2">
                  % Student Above Threshold
                </th>
                <th className="text-center px-4 py-2">Level</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(results.perCO).map(([co, data]) => (
                <tr key={co} className="border-t">
                  <td className="font-semibold text-left px-4 py-2">{co}</td>

                  <td className="text-center px-4 py-2">
                    {data.studentsAboveThreshold}
                  </td>

                  <td className="text-center font-mono px-4 py-2">
                    {data.percentAbove}%
                  </td>

                  <td className="text-center px-4 py-2">
                    <div
                      className={`inline-flex items-center justify-center w-10 h-8 rounded font-bold text-white ${
                        data.level === 3
                          ? "bg-green-600"
                          : data.level === 2
                            ? "bg-yellow-600"
                            : data.level === 1
                              ? "bg-orange-600"
                              : "bg-red-600"
                      }`}
                    >
                      {data.level}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
