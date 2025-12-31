import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function AttainmentResults({ results, isLoading }) {
  if (!results) return null
  
  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>CO Attainment Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 mb-6 ">
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{results.totalStudents}</div>
            <div>Total Students Present</div>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{results.CO}</div>
            <div>CO</div>
          </div>
        </div>
        
        <table className="w-full border">
          <thead>
            <tr className="bg-muted">
              <th>CO</th>
              <th>Students Above Threshold</th>
              <th>%Student Above Threshold</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(results.perCO).map(([co, data]) => (
              <tr key={co}>
                <td className="font-semibold">{co}</td>
                <td>{data.studentsAboveThreshold}/{data.totalStudents}</td>
                <td className="font-mono">{data.percentAbove}%</td>
                <td className={`font-bold px-3 py-1 rounded text-white ${
                  data.level === 3 ? 'bg-green-600' :
                  data.level === 2 ? 'bg-yellow-600' :
                  data.level === 1 ? 'bg-orange-600' : 'bg-red-600'
                }`}>
                  {data.level}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
