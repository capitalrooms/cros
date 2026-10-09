// The Twilio number's "A message comes in" webhook points here (set in the Twilio console). Same handler as
// /api/webhooks/twilio-inbound — it checks Twilio's signature against whichever of the two addresses was called.
export { POST } from '../../webhooks/twilio-inbound/route'
