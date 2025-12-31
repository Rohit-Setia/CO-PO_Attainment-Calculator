import { Input } from "@/components/ui/input"
import { COS } from "@/utils/calculations"

export default function CoMaxEditor({ coMax, setCoMax, totalMax, setTotalMax, thresholdPercent, setThresholdPercent, levelCriteria, setLevelCriteria }) {
 
  /* =========================
     HANDLE CO MAX CHANGE
  ========================= */
  const handleCoMaxChange = (co, value) => {
    const num = Number(value)
    const safeValue = isNaN(num) ? 0 : Math.max(0, num)

    setCoMax((prev) => ({
      ...prev,
      [co]: safeValue,
    }))
  }

  /* =========================
     HANDLE TOTAL MAX CHANGE
  ========================= */
  const handleTotalMaxChange = (value) => {
    const num = Number(value)
    setTotalMax(isNaN(num) ? 0 : Math.max(0, num))
  }

  return (
    <div className="flex gap-4 flex-wrap mb-6">
      {COS.map((co) => (
        <div key={co} className="flex items-center gap-2">
          <span className="uppercase font-medium">{co} Max</span>
          <Input
            type="number"
            min={0}
            className="w-20"
            value={coMax[co]}
            onChange={(e) =>
              handleCoMaxChange(co, e.target.value)
            }
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="uppercase font-medium">Total Max</span>
        <Input
          type="number"
          min={0}
          className="w-24"
          value={totalMax}
          onChange={(e) =>
            handleTotalMaxChange(e.target.value)
          }
        />
      </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border">
        <div className="flex flex-col justify-center items-center" >
          <label className="block text-sm font-medium mb-2">Threshold %</label>
          <Input 
            type="number" 
            value={thresholdPercent || 40}
            onChange={(e) => setThresholdPercent(Number(e.target.value))}
            className="w-32" min={0} max={100} placeholder="40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Level Criteria</label>
          <div className="flex gap-2 text-xs items-center">
            <Input type="number" value={levelCriteria?.level3||70} onChange={(e)=>setLevelCriteria({...levelCriteria,level3:Number(e.target.value)})} className="w-20" placeholder="70"/>≥L3
            <Input type="number" value={levelCriteria?.level2||60} onChange={(e)=>setLevelCriteria({...levelCriteria,level2:Number(e.target.value)})} className="w-20" placeholder="60"/>≥L2
            <Input type="number" value={levelCriteria?.level1||50} onChange={(e)=>setLevelCriteria({...levelCriteria,level1:Number(e.target.value)})} className="w-20" placeholder="50"/>≥L1
          </div>
        </div>
        </div>
    </div>
  )
}
