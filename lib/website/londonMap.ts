// The drawn London map's geometry (website map under the listings): the frame, a flat projection, the Thames and
// area names. Shared by the server (area names for homes) and the map itself.
export const BOX = { n: 51.625, s: 51.365, w: -0.40, e: 0.20 }
export const W = 1000, K = Math.cos(51.5 * Math.PI / 180)
export const H = Math.round(W * (BOX.n - BOX.s) / ((BOX.e - BOX.w) * K))
export const px = (lat: number, lng: number): [number, number] => [((lng - BOX.w) / (BOX.e - BOX.w)) * W, ((BOX.n - lat) / (BOX.n - BOX.s)) * H]
export const kmPx = W / ((BOX.e - BOX.w) * K * 111.32)

// the Thames, Hampton Court to Erith
export const THAMES: [number, number][] = [[51.403,-0.337],[51.411,-0.308],[51.428,-0.322],[51.445,-0.318],[51.458,-0.307],[51.483,-0.288],[51.470,-0.265],[51.474,-0.249],[51.487,-0.250],[51.488,-0.230],[51.467,-0.215],[51.461,-0.195],[51.482,-0.170],[51.483,-0.145],[51.487,-0.126],[51.500,-0.122],[51.509,-0.117],[51.509,-0.104],[51.507,-0.088],[51.505,-0.075],[51.503,-0.058],[51.506,-0.043],[51.508,-0.035],[51.500,-0.030],[51.485,-0.015],[51.485,-0.005],[51.497,0.002],[51.508,0.003],[51.500,0.012],[51.494,0.030],[51.494,0.065],[51.505,0.100],[51.512,0.115],[51.488,0.180],[51.470,0.210]]
export const AREAS: [string, number, number][] = [['Camden',51.542,-0.152],['Islington',51.540,-0.098],['Hackney',51.548,-0.030],['Stratford',51.541,-0.003],['Canary Wharf',51.494,-0.022],['Greenwich',51.474,-0.005],['Peckham',51.472,-0.069],['Brixton',51.460,-0.115],['Clapham',51.455,-0.150],['Fulham',51.476,-0.205],["Shepherd’s Bush",51.506,-0.224],['Kilburn',51.548,-0.195],['Walthamstow',51.584,-0.020],['Tottenham',51.598,-0.068],['Lewisham',51.457,-0.020],['Croydon',51.376,-0.098],['Wimbledon',51.421,-0.206],['Ealing',51.513,-0.304],['Wembley',51.556,-0.279],['Ilford',51.559,0.074],['Woolwich',51.486,0.069],['The City',51.517,-0.090],['West End',51.514,-0.140],['Richmond',51.461,-0.330],['Barking',51.545,0.090],['East Ham',51.532,0.050],['Royal Docks',51.507,0.040]]


/** never the street: the nearest area name and the postcode district (e.g. "Canary Wharf · E14") */
export function areaName(lat: number, lng: number, postcode: string | null) {
  const near = AREAS.reduce((b, a) => { const d = (a[1] - lat) ** 2 + ((a[2] - lng) * K) ** 2; return d < b.d ? { n: a[0], d } : b }, { n: '', d: Infinity }).n
  return [near, String(postcode ?? '').trim().split(' ')[0].toUpperCase()].filter(Boolean).join(' · ')
}

// the big green spaces, drawn as soft shapes: [name, lat, lng, half-width km, half-height km, tilt°]
export const PARKS: [string, number, number, number, number, number][] = [
  ['Richmond Park', 51.443, -0.274, 1.9, 1.5, -10], ['Hyde Park', 51.507, -0.168, 1.35, 0.45, -4], ["Regent’s Park", 51.530, -0.155, 0.62, 0.55, 0],
  ['Hampstead Heath', 51.563, -0.163, 0.95, 0.8, 20], ['Victoria Park', 51.536, -0.039, 0.75, 0.3, -20], ['Greenwich Park', 51.477, 0.001, 0.48, 0.4, 0],
  ['Clapham Common', 51.459, -0.149, 0.55, 0.35, 10], ['Battersea Park', 51.479, -0.157, 0.42, 0.3, 0], ['Wimbledon Common', 51.434, -0.235, 1.05, 1.1, 0],
  ['Wanstead Flats', 51.553, 0.030, 0.9, 0.4, -5], ['Walthamstow Marshes', 51.572, -0.048, 0.35, 1.1, 15], ['Wormwood Scrubs', 51.521, -0.236, 0.55, 0.3, 0],
  ['Crystal Palace', 51.421, -0.072, 0.42, 0.42, 0], ['Dulwich Park', 51.442, -0.081, 0.45, 0.4, 0], ['Bushy Park', 51.410, -0.335, 1.5, 0.9, 0],
  ['Hackney Marshes', 51.555, -0.025, 0.4, 0.6, 20], ['Burgess Park', 51.482, -0.081, 0.6, 0.25, 0],
]
