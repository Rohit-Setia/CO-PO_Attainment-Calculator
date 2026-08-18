import { Input } from "@/components/ui/input"
import { COS } from "@/utils/calculations"

export default function CoMaxEditor({ coMax, setCoMax, totalMax, setTotalMax, thresholdPercent, setThresholdPercent, levelCriteria, setLevelCriteria, readOnly = false }) {

  const safeNumber = (value) => {
    const num = Number(value)
    return isNaN(num) ? 0 : Math.max(0, num)
  }

  /* =========================
     HANDLE TOTAL MAX CHANGE
  ========================= */
  const handleTotalChange = (value) => {
    if (value === "") {
      setTotalMax("")
      return
    }
    const newTotal = safeNumber(value)
    setTotalMax(newTotal)
  }

  /* =========================
     HANDLE CO MAX CHANGE
  ========================= */
  const handleCoChange = (co, value) => {
    if (value === "") {
      setCoMax({ ...coMax, [co]: "" })
      return
    }
    const newVal = safeNumber(value)
    const newCoMax = { ...coMax, [co]: newVal }
    setCoMax(newCoMax)

    // Auto-increase totalMax if the new sum exceeds current totalMax
    const sum = Object.values(newCoMax).reduce((a, b) => a + Number(b || 0), 0)
    if (sum > Number(totalMax || 0)) {
      setTotalMax(sum)
    }
  }

  return (
    <div className="space-y-6 mb-6">

      {/* TOTAL MAX FIRST */}
      <div className="flex items-center gap-3">
        <span className="uppercase font-semibold">Total Max</span>
        <Input
          type="number"
          min={0}
          className={`w-28 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
          value={totalMax !== undefined && totalMax !== null ? totalMax : ""}
          onChange={(e) => handleTotalChange(e.target.value)}
          disabled={readOnly}
        />
      </div>

      {/* CO MAXS */}
      <div className="flex gap-4 flex-wrap">
        {COS.map((co) => (
          <div key={co} className="flex items-center gap-2">
            <span className="uppercase font-medium">{co} Max</span>
            <Input
              type="number"
              min={0}
              className={`w-20 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
              value={coMax[co] !== undefined && coMax[co] !== null ? coMax[co] : ""}
              onChange={(e) =>
                handleCoChange(co, e.target.value)
              }
              disabled={readOnly}
            />
          </div>
        ))}
      </div>

      {/* THRESHOLD + LEVEL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border">
        <div className="flex flex-col justify-center items-center" >
          <label className="block text-sm font-medium mb-2">Threshold %</label>
          <Input 
            type="number" 
            value={thresholdPercent !== undefined && thresholdPercent !== null ? thresholdPercent : ""}
            onChange={(e) => {
              const val = e.target.value;
              setThresholdPercent(val === "" ? "" : Number(val));
            }}
            className={`w-32 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
            min={0} max={100} placeholder="40"
            disabled={readOnly}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Level Criteria</label>
          <div className="flex gap-2 text-xs items-center">
            <Input 
              type="number" 
              value={levelCriteria?.level3 !== undefined && levelCriteria?.level3 !== null ? levelCriteria.level3 : ""} 
              onChange={(e) => {
                const val = e.target.value;
                setLevelCriteria({ ...levelCriteria, level3: val === "" ? "" : Number(val) });
              }} 
              className={`w-20 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="70" disabled={readOnly}
            />≥L3
            <Input 
              type="number" 
              value={levelCriteria?.level2 !== undefined && levelCriteria?.level2 !== null ? levelCriteria.level2 : ""} 
              onChange={(e) => {
                const val = e.target.value;
                setLevelCriteria({ ...levelCriteria, level2: val === "" ? "" : Number(val) });
              }} 
              className={`w-20 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="60" disabled={readOnly}
            />≥L2
            <Input 
              type="number" 
              value={levelCriteria?.level1 !== undefined && levelCriteria?.level1 !== null ? levelCriteria.level1 : ""} 
              onChange={(e) => {
                const val = e.target.value;
                setLevelCriteria({ ...levelCriteria, level1: val === "" ? "" : Number(val) });
              }} 
              className={`w-20 ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
              placeholder="50" disabled={readOnly}
            />≥L1
          </div>
        </div>
      </div>
    </div>
  )
}
