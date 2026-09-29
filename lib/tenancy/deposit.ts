// The standard deposit and holding-deposit figures. Five weeks' rent = monthly rent × 12 ÷ 52 × 5, to the penny
// (rounded down, so it never goes over the Tenant Fees Act cap); one week = monthly rent × 12 ÷ 52.
const down = (n: number) => Math.floor(n * 100 + 1e-6) / 100
export const fiveWeeksDeposit = (monthlyRent: number) => down(monthlyRent * 12 / 52 * 5)
export const oneWeekRent = (monthlyRent: number) => down(monthlyRent * 12 / 52)
