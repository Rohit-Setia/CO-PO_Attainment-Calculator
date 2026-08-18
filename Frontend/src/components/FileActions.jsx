import { Download } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function FileActions({
  students,
  onUpload,
  onDownload,
  results,
  canUpload = true,
}) {
  return (
    <div className="flex gap-4 mb-4 items-center flex-wrap">
      {/* Upload — hidden for Viewers */}
      {canUpload && (
        <input
          type="file"
          accept=".xls,.xlsx"
          onChange={(e) => onUpload(e.target.files[0])}
        />
      )}

      {/* Download — available to all roles */}
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

