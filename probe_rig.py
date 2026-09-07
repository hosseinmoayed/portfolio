"""Rigging-feasibility probes: mouth cavity + arm/torso clearance + slices."""
import json, struct, sys
import numpy as np
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else "lion3D.glb"
with open(path, "rb") as f:
    struct.unpack("<4sII", f.read(12))
    clen, _ = struct.unpack("<I4s", f.read(8))
    j = json.loads(f.read(clen))
    struct.unpack("<I4s", f.read(8))
    bin_base = f.tell()
    f.seek(0); blob = f.read()

def read_acc(idx):
    a = j["accessors"][idx]
    bv = j["bufferViews"][a["bufferView"]]
    ncomp = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4}[a["type"]]
    dt = {5126:"<f4",5125:"<u4",5123:"<u2"}[a["componentType"]]
    off = bin_base + bv.get("byteOffset",0) + a.get("byteOffset",0)
    stride = bv.get("byteStride") or ncomp*np.dtype(dt).itemsize
    raw = np.frombuffer(blob, np.uint8, stride*a["count"], off)
    raw = raw.reshape(a["count"], stride)[:, :ncomp*np.dtype(dt).itemsize]
    return np.ascontiguousarray(raw).view(dt).reshape(a["count"], ncomp)

prim = j["meshes"][0]["primitives"][0]
P = read_acc(prim["attributes"]["POSITION"]).astype(np.float64)
I = read_acc(prim["indices"]).reshape(-1, 3).astype(np.int64)
print(f"verts={len(P)} tris={len(I)}")

# ---------- 1. manifold / watertight check ----------
e = np.concatenate([I[:, [0,1]], I[:, [1,2]], I[:, [2,0]]])
e = np.sort(e, axis=1)
uniq, cnt = np.unique(e, axis=0, return_counts=True)
print("\n=== TOPOLOGY ===")
print(f"unique edges={len(uniq)}  boundary(1 face)={np.sum(cnt==1)}  "
      f"manifold(2)={np.sum(cnt==2)}  non-manifold(>2)={np.sum(cnt>2)}")
V = len(np.unique(I)); E = len(uniq); F = len(I)
print(f"Euler V-E+F = {V-E+F}  (2 = single closed shell, 2*k = k shells)")

# duplicate/welded check
uv = np.unique(np.round(P, 6), axis=0)
print(f"unique positions={len(uv)} of {len(P)}  -> "
      f"{'welded' if len(uv)>0.95*len(P) else 'SPLIT verts (UV seams)'}")

# ---------- 2. connected components (is backpack separate?) ----------
try:
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    n = len(P)
    m = coo_matrix((np.ones(len(uniq)), (uniq[:,0], uniq[:,1])), shape=(n,n))
    ncomp, lab = connected_components(m, directed=False)
    used = np.unique(I)
    sizes = np.bincount(lab[used])
    big = np.sort(sizes[sizes>0])[::-1][:8]
    print(f"\nconnected components (on used verts): {len(np.unique(lab[used]))}")
    print(f"largest component sizes: {big.tolist()}")
except ImportError:
    print("\n(scipy not available - skipped component analysis)")

# ---------- 3. head cross-sections: mouth cavity? ----------
ymax = P[:,1].max()
print(f"\n=== HEAD CROSS-SECTIONS (head top y={ymax:.3f}) ===")
S = 560
def slab_render(lo, hi, ax_h, ax_v, label):
    m = (P[:,1] >= lo) & (P[:,1] <= hi)
    q = P[m]
    if len(q) < 50: return None, 0
    h, v = q[:,ax_h], q[:,ax_v]
    lo2 = np.array([h.min(), v.min()]); hi2 = np.array([h.max(), v.max()])
    span = (hi2-lo2).max()*1.15
    cx, cy = (hi2+lo2)/2
    x = ((h-cx)/span+0.5)*(S-1); y = (0.5-(v-cy)/span)*(S-1)
    img = np.zeros((S,S), np.float32)
    np.add.at(img, (np.clip(y.astype(int),0,S-1), np.clip(x.astype(int),0,S-1)), 1)
    img = np.clip(img*110, 0, 255)
    return img.astype(np.uint8), len(q)

# muzzle region is lower-front of head; sample several horizontal slabs
tiles = []
bands = [(0.42,0.44,"y .42-.44 top-skull"),
         (0.36,0.38,"y .36-.38 eye/brow"),
         (0.31,0.33,"y .31-.33 muzzle/nose"),
         (0.28,0.30,"y .28-.30 jaw/chin"),
         (0.24,0.26,"y .24-.26 neck"),
         (0.10,0.12,"y .10-.12 chest")]
for lo, hi, lab in bands:
    im, cn = slab_render(lo, hi, 0, 2, lab)   # top-down XZ slice
    print(f"  {lab}: {cn} verts in slab")
    tiles.append(im if im is not None else np.zeros((S,S),np.uint8))

sheet = np.zeros((2*S, 3*S), np.uint8)
for i,t in enumerate(tiles):
    r,c = divmod(i,3); sheet[r*S:(r+1)*S, c*S:(c+1)*S] = t
Image.fromarray(sheet).save("lion_slices.png")
print("wrote lion_slices.png (top-down XZ slabs, order above)")

# ---------- 4. arm / torso clearance ----------
print("\n=== ARM vs TORSO CLEARANCE ===")
# at hip/upper-thigh height, look at the X histogram to find arm & body masses
for lo, hi, lab in [(-0.02,0.02,"waist"), (-0.10,-0.06,"hip/hand"),
                    (0.02,0.06,"lower ribs"), (0.14,0.18,"upper arm")]:
    m = (P[:,1]>=lo)&(P[:,1]<=hi)
    q = P[m]
    if len(q)<50: continue
    xs = q[:,0]
    hist, edges = np.histogram(xs, bins=60)
    occupied = hist > (hist.max()*0.03)
    # find gaps between occupied runs
    runs = []
    start = None
    for i,o in enumerate(occupied):
        if o and start is None: start = i
        if not o and start is not None:
            runs.append((start,i-1)); start=None
    if start is not None: runs.append((start,len(occupied)-1))
    w = edges[1]-edges[0]
    gaps = [(edges[runs[k][1]+1], edges[runs[k+1][0]]) for k in range(len(runs)-1)]
    gtxt = ", ".join(f"{(b-a)*1000:.1f}mm@x={a:.3f}" for a,b in gaps) or "none"
    print(f"  {lab:12s} y[{lo:+.2f},{hi:+.2f}] masses={len(runs)} gaps: {gtxt}")

print(f"\nmodel height = {P[:,1].max()-P[:,1].min():.4f} units")
print("(if the model is a ~1.8m character, 1 unit = 1.8m -> 1mm here = 1.8mm real)")
