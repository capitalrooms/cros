// What can go wrong out of hours, who fixes it, and what the tenant can do until someone arrives.
// Shared by the tenant's report screen, the messages sent to the house, and the office's Emergencies screen.

export type EmergencyKind =
  | 'gas' | 'co' | 'fire' | 'flooding' | 'ceiling_water' | 'power' | 'electrical' | 'heating'
  | 'security' | 'window' | 'toilet' | 'appliance_leak' | 'smoke_alarm' | 'other'

export interface KindInfo {
  label: string
  trade: 'plumbing' | 'electrical' | 'heating' | 'locksmith' | 'glazing' | 'general' | null   // null = emergency services, not a contractor
  callServices?: string        // shown first when it's a 999 / gas-line matter
  steps: string[]              // what to do now, until a professional arrives
  canWait?: boolean            // usually safe until morning once the steps are done
}

export const KINDS: Record<EmergencyKind, KindInfo> = {
  gas: {
    label: 'Gas smell', trade: null, callServices: 'Call the National Gas Emergency line now: 0800 111 999 (free, 24 hours).',
    steps: ['Get everyone outside.', 'Don’t use light switches, phones, flames or anything electrical inside.', 'Open doors and windows on your way out if it’s safe.', 'Turn the gas off at the meter if you can reach it safely.', 'Wait outside for the gas engineer, then tell us what they said.'],
  },
  co: {
    label: 'Carbon monoxide alarm', trade: null, callServices: 'Get everyone out, then call 0800 111 999. If anyone feels dizzy, sick or has a headache, call 999.',
    steps: ['Get everyone outside into fresh air.', 'Open windows on your way out if it’s quick and safe.', 'Turn off gas appliances (boiler, hob) if you can on the way.', 'Don’t go back in until the engineer says it’s safe.'],
  },
  fire: {
    label: 'Fire', trade: null, callServices: 'Get out and call 999.',
    steps: ['Get everyone out — don’t stop for belongings.', 'Close doors behind you.', 'Call 999 from outside and ask for the fire service.', 'Don’t go back in.'],
  },
  flooding: {
    label: 'Burst pipe or water leak', trade: 'plumbing',
    steps: ['Turn off the water at the stopcock (usually under the kitchen sink, or where the pipe comes into the house).', 'If water is near sockets or lights, switch the electricity off at the fuse board — only if you can reach it without standing in water.', 'Put towels and buckets down and move belongings out of the way.', 'Open taps on the lowest floor to drain the pipes.', 'Take photos for us.'],
    canWait: true,
  },
  ceiling_water: {
    label: 'Water coming through a ceiling or light', trade: 'plumbing',
    steps: ['Switch the lighting circuit off at the fuse board, and don’t touch the light or switch.', 'Turn the water off at the stopcock.', 'If the ceiling is bulging, put a bucket underneath and keep everyone out of that room.', 'Take photos for us.'],
  },
  power: {
    label: 'No electricity', trade: 'electrical',
    steps: ['Look at the fuse board: if a switch has tripped, unplug everything on that circuit and switch it back on once.', 'If it trips again, leave it off — something plugged in may be faulty. Plug things back in one at a time to find it.', 'If the whole street is dark, it’s a power cut: call 105 for updates.', 'Use torches, not candles.'],
    canWait: true,
  },
  electrical: {
    label: 'Sparking, burning smell or exposed wires', trade: 'electrical', callServices: 'If there is smoke or fire, get out and call 999.',
    steps: ['Don’t touch it.', 'Switch the electricity off at the fuse board if it’s safe to reach.', 'Keep water away from it.', 'Keep everyone out of that room.'],
  },
  heating: {
    label: 'No heating or hot water', trade: 'heating',
    steps: ['Check the boiler pressure gauge: it should read 1–1.5. If it’s below 1, top it up with the filling loop (the little tap(s) under the boiler) until it reaches 1.5.', 'Press the boiler’s reset button once.', 'Check the thermostat and timer are on, and that the electricity and gas are on.', 'Use spare blankets and plug-in heaters if you have them.'],
    canWait: true,
  },
  security: {
    label: 'Front door won’t lock or a break-in', trade: 'locksmith', callServices: 'If someone is in the property or you feel unsafe, leave and call 999.',
    steps: ['If you can, secure the door from inside with a bolt or chain, or wedge a chair under the handle.', 'Keep valuables in your room and lock your room door.', 'If it was a break-in, don’t touch anything and call 101 to get a crime reference.'],
  },
  window: {
    label: 'Broken window', trade: 'glazing',
    steps: ['Carefully clear up the glass with gloves or a dustpan.', 'Cover the gap with cardboard or plastic and tape.', 'Close that room off and keep it locked if you can.'],
    canWait: true,
  },
  toilet: {
    label: 'Blocked or overflowing toilet', trade: 'plumbing',
    steps: ['Don’t flush again.', 'Turn off the little valve on the pipe behind the toilet to stop it refilling.', 'Try a plunger with firm, steady pushes.', 'If there’s another toilet in the house, use that until it’s fixed.'],
    canWait: true,
  },
  appliance_leak: {
    label: 'Appliance leaking', trade: 'plumbing',
    steps: ['Switch the appliance off at the wall.', 'Turn off its water valve (on the pipe behind the washing machine or dishwasher).', 'Mop up and keep towels down.'],
    canWait: true,
  },
  smoke_alarm: {
    label: 'Smoke alarm beeping', trade: 'electrical',
    steps: ['A single chirp every minute is usually a low battery — the alarm still works.', 'Never take the alarm down or take the battery out.', 'If it’s sounding with no smoke, open windows and press the test/hush button.'],
    canWait: true,
  },
  other: {
    label: 'Something else urgent', trade: 'general',
    steps: ['Keep everyone safe and away from the problem.', 'Take photos for us.', 'If anyone is in danger, call 999.'],
  },
}

/** Best guess at what kind of emergency this is, from the tenant's words and the category they chose. */
export function kindFrom(description: string, category = ''): EmergencyKind {
  const d = `${description} ${category}`.toLowerCase()
  if (/carbon monoxide|\bco alarm\b|co detector/.test(d)) return 'co'
  if (/gas leak|smell(s|ing)? (of )?gas|gas smell/.test(d)) return 'gas'
  if (/\bfire\b|flames|on fire/.test(d)) return 'fire'
  if (/(ceiling|light).{0,25}(water|drip|leak)|(water|drip|leak).{0,25}(ceiling|light fitting)/.test(d)) return 'ceiling_water'
  if (/spark|burning smell|smell of burning|exposed wire|electric shock/.test(d)) return 'electrical'
  if (/no (power|electric)|power (cut|out)|lost (all )?power|fuse (box|board).{0,20}trip|electricity (is )?off/.test(d)) return 'power'
  if (/burst|flood|pouring|gushing|water (leak|everywhere|pouring)|leak(ing)?/.test(d) && !/washing machine|dishwasher|fridge/.test(d)) return 'flooding'
  if (/washing machine|dishwasher|fridge/.test(d) && /leak|water/.test(d)) return 'appliance_leak'
  if (/no (heating|hot water)|boiler|radiators? (cold|not)/.test(d)) return 'heating'
  if (/(front )?door.{0,20}(won.?t|can.?t|doesn.?t) lock|broken lock|break.?in|burglar|locked out/.test(d)) return 'security'
  if (/window.{0,20}(broken|smashed|cracked)|(broken|smashed) window/.test(d)) return 'window'
  if (/toilet|loo|sewage/.test(d)) return 'toilet'
  if (/smoke alarm|beeping|chirp/.test(d)) return 'smoke_alarm'
  if (/plumb|water|pipe/.test(d)) return 'flooding'
  if (/electr/.test(d)) return 'electrical'
  if (/heat/.test(d)) return 'heating'
  return 'other'
}

export const TRADE_LABEL: Record<string, string> = {
  plumbing: 'Plumbing', electrical: 'Electrical', heating: 'Heating / gas', locksmith: 'Locksmith', glazing: 'Glazing / boarding', roofing: 'Roofing', general: 'General / handyman',
}
