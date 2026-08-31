/**
 * Marks Distribution Utility (Frontend)
 * 
 * Implements proportional weightage distribution of a student's total exam marks
 * across active Course Outcomes (COs) based on each CO's configured maximum marks.
 * 
 * Uses the Largest Remainder Method (Hamilton-Hare) to guarantee that the sum of
 * distributed CO marks always exactly equals the total marks entered, eliminating
 * floating-point rounding discrepancies.
 */

/**
 * Calculates the total maximum marks available for an exam component.
 * @param {Array} courseOutcomes Array of active CO objects ({ id, co_number, max_internal, max_external })
 * @param {boolean} isInternal True for MTT (Internal), False for ETT (External)
 * @returns {number} Sum of maximum marks across all active COs
 */
export function calculateExamTotalMax(courseOutcomes, isInternal) {
  if (!Array.isArray(courseOutcomes) || courseOutcomes.length === 0) return 0;
  return courseOutcomes.reduce((sum, co) => {
    const max = parseFloat(isInternal ? co.max_internal : co.max_external) || 0;
    return sum + max;
  }, 0);
}

/**
 * Returns the weightage breakdown of active Course Outcomes for display.
 * @param {Array} courseOutcomes Array of active CO objects
 * @param {boolean} isInternal True for MTT, False for ETT
 * @returns {Array} Array of { coId, coNumber, maxMarks, percentage }
 */
export function getCoWeightageBreakdown(courseOutcomes, isInternal) {
  if (!Array.isArray(courseOutcomes) || courseOutcomes.length === 0) return [];
  const totalMax = calculateExamTotalMax(courseOutcomes, isInternal);
  return courseOutcomes.map((co) => {
    const maxMarks = parseFloat(isInternal ? co.max_internal : co.max_external) || 0;
    const percentage = totalMax > 0 ? ((maxMarks / totalMax) * 100).toFixed(1) : '0.0';
    return {
      coId: co.id,
      coNumber: co.co_number,
      maxMarks,
      percentage: parseFloat(percentage),
    };
  });
}

/**
 * Distributes a total score across Course Outcomes proportionally based on their max marks.
 * 
 * @param {Object} options
 * @param {number|string} options.totalMarks Total score scored by the student (0 <= totalMarks <= totalMax)
 * @param {Array} options.courseOutcomes Array of active CO objects
 * @param {boolean} options.isInternal True for MTT, False for ETT
 * @param {number} [options.decimals=2] Decimal precision (default: 2)
 * @returns {Object} { coMarks: { [co_id]: number }, totalDistributed: number, error: string|null }
 */
export function distributeTotalMarksToCos({ totalMarks, courseOutcomes, isInternal, decimals = 2 }) {
  if (!Array.isArray(courseOutcomes) || courseOutcomes.length === 0) {
    return { coMarks: {}, totalDistributed: 0, error: 'No active Course Outcomes found.' };
  }

  if (totalMarks === '' || totalMarks === null || totalMarks === undefined) {
    const emptyCoMarks = {};
    courseOutcomes.forEach((co) => {
      emptyCoMarks[co.id] = '';
    });
    return { coMarks: emptyCoMarks, totalDistributed: 0, error: null };
  }

  const rawTotal = parseFloat(totalMarks);
  if (isNaN(rawTotal)) {
    return { coMarks: {}, totalDistributed: 0, error: 'Total marks must be a valid number.' };
  }

  if (rawTotal < 0) {
    return { coMarks: {}, totalDistributed: 0, error: 'Total marks cannot be negative.' };
  }

  const totalMax = calculateExamTotalMax(courseOutcomes, isInternal);
  if (totalMax <= 0) {
    return { coMarks: {}, totalDistributed: 0, error: 'Total maximum marks for Course Outcomes is 0. Please configure CO max marks first.' };
  }

  if (rawTotal > totalMax + 1e-6) {
    return {
      coMarks: {},
      totalDistributed: 0,
      error: `Total marks (${rawTotal}) cannot exceed the exam maximum of ${totalMax}.`,
    };
  }

  if (rawTotal === 0) {
    const zeroCoMarks = {};
    courseOutcomes.forEach((co) => {
      zeroCoMarks[co.id] = 0;
    });
    return { coMarks: zeroCoMarks, totalDistributed: 0, error: null };
  }

  const scale = Math.pow(10, decimals);
  const targetScaled = Math.round(rawTotal * scale);

  // Compute unrounded allocations and base floored integer units
  const allocations = courseOutcomes.map((co) => {
    const coMax = parseFloat(isInternal ? co.max_internal : co.max_external) || 0;
    const exactShare = totalMax > 0 ? (rawTotal * (coMax / totalMax)) : 0;
    const scaledExact = exactShare * scale;
    const baseUnits = Math.floor(scaledExact);
    const remainder = scaledExact - baseUnits;

    return {
      coId: co.id,
      coNumber: co.co_number,
      coMax,
      baseUnits,
      remainder,
      finalUnits: baseUnits,
    };
  });

  const currentSum = allocations.reduce((sum, a) => sum + a.baseUnits, 0);
  const diff = targetScaled - currentSum; // Integer number of remaining cents/subunits to allocate

  if (diff > 0) {
    // Sort descending by fractional remainder
    const sortedIndices = allocations
      .map((a, idx) => ({ idx, remainder: a.remainder }))
      .sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < diff && i < sortedIndices.length; i += 1) {
      allocations[sortedIndices[i].idx].finalUnits += 1;
    }
  }

  const coMarks = {};
  let totalDistributed = 0;

  allocations.forEach((a) => {
    const finalMark = Math.min(a.coMax, Math.max(0, a.finalUnits / scale));
    coMarks[a.coId] = parseFloat(finalMark.toFixed(decimals));
    totalDistributed += coMarks[a.coId];
  });

  totalDistributed = parseFloat(totalDistributed.toFixed(decimals));

  return {
    coMarks,
    totalDistributed,
    error: null,
  };
}
