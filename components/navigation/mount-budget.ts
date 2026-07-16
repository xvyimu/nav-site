export function allocateSectionMountBudget(
  sectionLengths: number[],
  totalBudget: number,
  alreadyMounted = 0
): number[] {
  let remaining = Math.max(0, totalBudget - alreadyMounted);
  return sectionLengths.map((length) => {
    const allocated = Math.min(Math.max(0, length), remaining);
    remaining -= allocated;
    return allocated;
  });
}
