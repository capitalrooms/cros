// Finance mode (Harry, 3 Nov 2026: "we are not receiving rents this month in CROS … I will just add statements … I will
// use the other system first"). CROS is in replication mode: rent is collected in the other system and CROS mirrors the
// statements. While this is false nothing raises rent charges on its own (the 1st-of-month job and the morning safety
// net) and the Finance screens don't ask for rent to be raised or chased. Turn on only when Harry says CROS collects rent.
export const CROS_COLLECTS_RENT = false
