import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function FileActions({
  students,
  onUpload,
  onDownload,
  results,
}) {
  return (
    <div className="flex gap-4 mb-4 items-center">
      {/* Upload */}
      <input
        type="file"
        accept=".xls,.xlsx"
        onChange={(e) => onUpload(e.target.files[0])}
      />

      {/* Download */}
      <Button
        onClick={onDownload}
        disabled={!students.length || !results}
      >
        <Download className="mr-2 h-4 w-4" />
        Download Excel
      </Button>
    </div>
  )
}
