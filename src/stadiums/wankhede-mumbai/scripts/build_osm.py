"""Convert Overpass JSON (osm_raw.json) into a compact local-metre scene file.
Data (c) OpenStreetMap contributors, ODbL. Origin = centre of Wankhede playing field.
x = east, z = south (three.js +z toward camera)."""
import json, math, random

lat0, lon0 = 18.9389, 72.8258
OX, OY = -6.1, 0.86  # field centre in metres from (lat0, lon0)
R = 1050

def xy(p):
    e = (p['lon'] - lon0) * 111320 * math.cos(math.radians(lat0)) - OX
    n = (p['lat'] - lat0) * 110574 - OY
    return round(e, 1), round(-n, 1)

els = json.load(open('osm_raw.json'))['elements']
out = {'b': [], 'r': [], 'g': [], 's': [], 'p': []}
flat = lambda pts: [v for p in pts for v in p]

for e in els:
    t, g = e['tags'], [xy(p) for p in e['geometry']]
    near = any(math.hypot(x, z) < R for x, z in g)
    if 'building' in t and near:
        cx = sum(p[0] for p in g) / len(g); cz = sum(p[1] for p in g) / len(g)
        if math.hypot(cx, cz) < 120 or len(g) < 4:
            continue
        rnd = random.Random(e['id'])
        k = t['building']
        if 'height' in t:
            try: h = float(t['height'].split()[0])
            except ValueError: h = 12
        elif 'building:levels' in t:
            try: h = float(t['building:levels']) * 3.3
            except ValueError: h = 12
        elif k == 'apartments': h = 18 + rnd.random() * 30
        elif k == 'roof': h = 4
        elif k in ('commercial', 'office', 'hotel'): h = 18 + rnd.random() * 22
        else: h = 8 + rnd.random() * 10
        out['b'].append({'p': flat(g[:-1] if g[0] == g[-1] else g), 'h': round(h, 1)})
    elif 'highway' in t and near:
        # dual carriageways are separate one-way ways in OSM; keep the flag and make points follow travel direction
        ow = t.get('oneway') in ('yes', 'true', '1', '-1') or t.get('junction') == 'roundabout' or t['highway'] == 'motorway'
        pts = g[::-1] if t.get('oneway') == '-1' else g
        out['r'].append({'c': t['highway'].replace('_link', ''), 'p': flat(pts), 'o': 1 if ow else 0})
    elif 'railway' in t and near:
        out['r'].append({'c': 'rail', 'p': flat(g)})
    elif t.get('leisure') == 'pitch' and t.get('sport') == 'cricket' and e['id'] != 511774445 and near and len(g) > 3:
        # cricket maidan / practice pitch: keep outline + centre + long-axis angle for the strip
        pts = g[:-1] if g[0] == g[-1] else g
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        sxx = sum((p[0]-cx)**2 for p in pts); szz = sum((p[1]-cz)**2 for p in pts); sxz = sum((p[0]-cx)*(p[1]-cz) for p in pts)
        a = 0.5 * math.atan2(2*sxz, sxx - szz)
        out['p'].append({'p': flat(pts), 'c': [round(cx, 1), round(cz, 1)], 'a': round(a, 3)})
    elif (t.get('leisure') in ('park', 'garden', 'playground') or t.get('landuse') in ('grass', 'recreation_ground', 'forest')
          or (t.get('leisure') == 'pitch' and e['id'] != 511774445)) and near:
        if len(g) > 3 and math.hypot(*g[0]) > 100:
            out['g'].append({'p': flat(g[:-1] if g[0] == g[-1] else g)})

# sea: chain the NW/W coastline ways and close the polygon far to the west
coast = [[xy(p) for p in e['geometry']] for e in els if e['tags'].get('natural') == 'coastline']
coast = [c for c in coast if c[0][0] < 0]
coast.sort(key=lambda c: c[0][1])  # not reliable; chain by endpoints instead
chain = coast.pop(0)
while coast:
    nxt = next((c for c in coast if c[0] == chain[-1]), None)
    if not nxt:
        nxt = next((c for c in coast if c[-1] == chain[0]), None)
        if not nxt: break
        coast.remove(nxt); chain = nxt + chain; continue
    coast.remove(nxt); chain += nxt[1:]
if chain[0][1] > chain[-1][1]: chain.reverse()  # start = north end... ensure west closure below
chain.sort(key=lambda p: 0) if False else None
poly = chain + [(-5000, chain[-1][1]), (-5000, chain[0][1])]
out['s'] = flat(poly)
json.dump(out, open('../src/data/osm.json', 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items()}, 'sea chain', chain[0], chain[-1])
