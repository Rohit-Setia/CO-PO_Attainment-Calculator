import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export const calculateAttainment = async (students, coMax, thresholdPercent, levelCriteria, options = {}) => {
  const { assessment_id, subject_id, classroom_id } = options;
  const data = {
    students: students.map(s => ({
      regNo: s.roll,
      name: s.name,
      ...Object.keys(coMax || {}).reduce((acc, coKey) => ({ ...acc, [coKey]: s[coKey] }), {})
    })),
    coMaxMarks: Object.keys(coMax || {}).reduce((acc, coKey) => ({ ...acc, [coKey.toUpperCase()]: coMax[coKey] }), {}),
    thresholdPercent,
    levelCriteria,
    ...(assessment_id && { assessment_id }),
    ...(subject_id && { subject_id }),
    ...(classroom_id && { classroom_id })
  }
  
  return axios.post(`${API_BASE}/calculate`, data)
}

export const downloadExcel = async (students, coMax, results,levelCriteria, thresholdPercent, courseInfo = {}) => {
    const res = await axios.post(`${API_BASE}/export-excel`, {
      students: students.map(s => ({
        regNo: s.roll, name: s.name,
        CO1: s.co1, CO2: s.co2, CO3: s.co3, CO4: s.co4, CO5: s.co5
      })),
      coMaxMarks: {
        CO1: coMax.co1, CO2: coMax.co2, CO3: coMax.co3, 
        CO4: coMax.co4, CO5: coMax.co5
      },
      results,levelCriteria, thresholdPercent,
      courseInfo
    }, { responseType: 'blob' });
    
    return res.data
  }