"""Convert an Overpass JSON dump (osm_raw.json, `out tags geom` ways + tree/tower nodes around -37.82, 144.9834)
into the compact local-metre scene file data/osm.json. Data (c) OpenStreetMap contributors, ODbL.
Origin = centre of the MCG playing field (the AFL pitch polygon). x = east, z = south.
Usage: python3 build_osm.py osm_raw.json ../data/osm.json"""
import json, math, random, sys

lat0, lon0 = -37.8200, 144.9834
OX, OZ = 5.07, -39.14  # field centre in metres from (lat0, lon0), x east / z south (the real centre is at 0.86; the ground is drawn 40 m further north)
R = 820

def xy(p):
    return (round((p['lon'] - lon0) * 111320 * math.cos(math.radians(lat0)) - OX, 1),
            round(-(p['lat'] - lat0) * 110574 - OZ, 1))

els = json.load(open(sys.argv[1]))['elements']
out = {'b': [], 'r': [], 'g': [], 'p': [], 'w': [], 'l': [], 't': []}
flat = lambda pts: [v for p in pts for v in p]
open_ = lambda g: g[:-1] if g[0] == g[-1] else g
near = lambda g: any(math.hypot(x, z) < R for x, z in g)
ROADS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service',
         'pedestrian', 'footway', 'cycleway', 'living_street', 'path', 'track'}

for e in els:
    if e['type'] == 'node':
        t = e.get('tags', {})
        if t.get('natural') == 'tree':
            x, z = xy(e)
            if math.hypot(x, z) < R: out['t'].append([x, z])
        elif t.get('tower') == 'light' and False:
            pass
        continue
    t, g = e['tags'], [xy(p) for p in e['geometry']]
    if not near(g): continue
    if 'building' in t:
        pts = open_(g)
        if len(pts) < 3 or t['building'] in ('grandstand',): continue
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        if math.hypot(cx, cz) < 150: continue
        rnd = random.Random(e['id']); k = t['building']
        if 'height' in t:
            try: h = float(t['height'].split()[0])
            except ValueError: h = 10
        elif 'building:levels' in t:
            try: h = float(t['building:levels']) * 3.3
            except ValueError: h = 10
        elif k == 'house': h = 5 + rnd.random() * 2.5
        elif k in ('garage', 'roof', 'shed', 'carport'): h = 3
        elif k == 'apartments': h = 15 + rnd.random() * 25
        elif k in ('commercial', 'office', 'hotel', 'retail', 'hospital'): h = 14 + rnd.random() * 24
        else: h = 7 + rnd.random() * 7
        area = abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))) / 2
        nm = t.get('name', '')
        venue = area > 3000 and (t.get('leisure') == 'stadium' or any(k in nm for k in ('Arena', 'Stadium', 'Centre', 'Center')))
        b = {'p': flat(pts), 'h': round(max(h, 24) if venue else h, 1)}
        if venue: b['v'] = 1
        out['b'].append(b)
    elif 'highway' in t and t['highway'].replace('_link', '') in ROADS:
        c = t['highway'].replace('_link', '')
        if t.get('tunnel') in ('yes', 'building_passage') or t.get('layer', '0').lstrip('-').isdigit() and int(t.get('layer', '0')) < 0: continue
        ow = t.get('oneway') in ('yes', 'true', '1', '-1') or t.get('junction') == 'roundabout' or c == 'motorway'
        pts = g[::-1] if t.get('oneway') == '-1' else g
        out['r'].append({'c': c, 'p': flat(pts), 'o': 1 if ow else 0})
    elif t.get('railway') in ('rail', 'light_rail'):
        out['r'].append({'c': 'rail', 'p': flat(g)})
    elif t.get('railway') == 'tram':
        out['r'].append({'c': 'tram', 'p': flat(g)})
    elif t.get('waterway') in ('river', 'canal'):
        out['l'].append({'p': flat(g), 'w': 40 if t['waterway'] == 'river' else 8})
    elif t.get('natural') == 'water' and len(g) > 3:
        out['w'].append({'p': flat(open_(g))})
    elif t.get('leisure') == 'pitch' and t.get('sport') in ('tennis', 'basketball', 'cricket_nets', None) and False:
        pass
    elif t.get('leisure') == 'pitch' and len(g) > 3 and t.get('sport') not in ('australian_football', 'cricket') or \
         (t.get('leisure') == 'pitch' and math.hypot(*g[0]) > 120 and len(g) > 3):
        pts = open_(g)
        cx = sum(p[0] for p in pts) / len(pts); cz = sum(p[1] for p in pts) / len(pts)
        sxx = sum((p[0]-cx)**2 for p in pts); szz = sum((p[1]-cz)**2 for p in pts); sxz = sum((p[0]-cx)*(p[1]-cz) for p in pts)
        a = 0.5 * math.atan2(2*sxz, sxx - szz)
        out['p'].append({'p': flat(pts), 'c': [round(cx, 1), round(cz, 1)], 'a': round(a, 3), 's': t.get('sport', '')})
    elif (t.get('leisure') in ('park', 'garden', 'playground', 'common') or t.get('landuse') in ('grass', 'recreation_ground', 'forest', 'meadow', 'village_green')
          or t.get('natural') in ('wood', 'grassland', 'scrub')) and len(g) > 3 and math.hypot(*g[0]) > 60:
        out['g'].append({'p': flat(open_(g)), 'w': 1 if t.get('natural') == 'wood' or t.get('landuse') == 'forest' else 0})

# Dual carriageways: OSM draws each direction as its own way, and a way sometimes stops short where the other
# direction carries on. Extend such a way along its twin (same sideways offset) so both directions run the same length.
MAJOR = ('motorway', 'trunk', 'primary', 'secondary', 'tertiary')
ways = [r for r in out['r'] if r.get('o') and r['c'] in MAJOR]
pts_of = lambda r: [(r['p'][i], r['p'][i + 1]) for i in range(0, len(r['p']), 2)]
def tangent(P, at_end):
    a, c = (P[-2], P[-1]) if at_end else (P[1], P[0])
    d = math.hypot(c[0] - a[0], c[1] - a[1]) or 1
    return ((c[0] - a[0]) / d, (c[1] - a[1]) / d)
extended = 0
for r in ways:
    for at_end in (True, False):
        P = pts_of(r)
        E = P[-1] if at_end else P[0]
        t = tangent(P, at_end)
        best = None
        # this road already carries on into another way: nothing to extend
        cont = False
        for x in ways:
            if x is r: continue
            X = pts_of(x)
            j = 0 if at_end else len(X) - 1
            if math.hypot(X[j][0] - E[0], X[j][1] - E[1]) < 6:
                tx = tangent(X, not at_end) if at_end else tangent(X, True)
                if (tx[0] * t[0] + tx[1] * t[1]) > 0.3: cont = True
        if cont: continue
        for x in ways:
            if x is r or x['c'] != r['c']: continue
            X = pts_of(x)
            k = min(range(len(X)), key=lambda i: math.hypot(X[i][0] - E[0], X[i][1] - E[1]))
            if math.hypot(X[k][0] - E[0], X[k][1] - E[1]) > 18: continue
            # the twin must run the opposite way to this road, side by side with it
            ld = (X[min(k + 1, len(X) - 1)][0] - X[max(k - 1, 0)][0], X[min(k + 1, len(X) - 1)][1] - X[max(k - 1, 0)][1])
            ll = math.hypot(*ld) or 1
            if (ld[0] * t[0] + ld[1] * t[1]) / ll > -0.7: continue
            if math.hypot(X[k][0] - E[0], X[k][1] - E[1]) < 2: continue
            xt = tangent(X[:k + 1], True) if k > 0 else None
            xt2 = tangent(X[k:], False) if k < len(X) - 1 else None
            for rest, tt in ((X[:k][::-1], xt), (X[k + 1:], xt2)):
                if tt is None or len(rest) < 2: continue
                # beyond this road's end, in its own travel direction, the twin's remaining points continue
                ahead = (rest[0][0] - X[k][0]) * t[0] + (rest[0][1] - X[k][1]) * t[1]
                rd = (rest[1][0] - rest[0][0], rest[1][1] - rest[0][1])
                rl = math.hypot(*rd) or 1
                if ahead > 0 and (rd[0] * t[0] + rd[1] * t[1]) / rl > 0.8:
                    length = sum(math.hypot(rest[i + 1][0] - rest[i][0], rest[i + 1][1] - rest[i][1]) for i in range(len(rest) - 1))
                    if length > 30 and (best is None or length > best[0]): best = (length, rest, X[k])
        if best:
            _, rest, kp = best
            off = (E[0] - kp[0], E[1] - kp[1])
            add = [(round(q[0] + off[0], 1), round(q[1] + off[1], 1)) for q in rest]
            P = P + add if at_end else add[::-1] + P
            r['p'] = [v for q in P for v in q]
            extended += 1
print('carriageway ways extended:', extended)
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
print({k: len(v) for k, v in out.items()})
