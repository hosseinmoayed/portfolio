"""Software point-splat renderer to preview a GLB's geometry without a 3D app.
Reads POSITION + NORMAL, projects orthographically, z-buffers, Lambert-shades.
"""
import json, struct, sys
import numpy as np
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else "lion3D.glb"
S = 620  # per-view resolution

with open(path, "rb") as f:
    struct.unpack("<4sII", f.read(12))
    clen, _ = struct.unpack("<I4s", f.read(8))
    j = json.loads(f.read(clen))
    struct.unpack("<I4s", f.read(8))
    bin_base = f.tell()
    f.seek(0)
    blob = f.read()

def read_acc(idx):
    a = j["accessors"][idx]
    bv = j["bufferViews"][a["bufferView"]]
    ncomp = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    dt = {5126: "<f4", 5125: "<u4", 5123: "<u2"}[a["componentType"]]
    off = bin_base + bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride") or ncomp * np.dtype(dt).itemsize
    raw = np.frombuffer(blob, dtype=np.uint8,
                        count=stride * a["count"], offset=off)
    raw = raw.reshape(a["count"], stride)[:, : ncomp * np.dtype(dt).itemsize]
    return np.ascontiguousarray(raw).view(dt).reshape(a["count"], ncomp)

prim = j["meshes"][0]["primitives"][0]
P = read_acc(prim["attributes"]["POSITION"]).astype(np.float32)
N = read_acc(prim["attributes"]["NORMAL"]).astype(np.float32)
print("verts:", P.shape, "bbox:", P.min(0).round(3), P.max(0).round(3))


def render(pos, nrm, axes, flip, title, crop=None):
    """axes: (h_axis, v_axis, depth_axis); crop: (vmin,vmax) in world units on v."""
    p, n = pos, nrm
    if crop is not None:
        m = (p[:, axes[1]] >= crop[0]) & (p[:, axes[1]] <= crop[1])
        p, n = p[m], n[m]
        if len(p) == 0:
            return np.zeros((S, S, 3), np.uint8)

    h = p[:, axes[0]] * (-1 if flip[0] else 1)
    v = p[:, axes[1]] * (-1 if flip[1] else 1)
    d = p[:, axes[2]] * (-1 if flip[2] else 1)

    lo = np.array([h.min(), v.min()])
    hi = np.array([h.max(), v.max()])
    span = (hi - lo).max() * 1.06
    cx, cy = (hi + lo) / 2
    x = ((h - cx) / span + 0.5) * (S - 1)
    y = (0.5 - (v - cy) / span) * (S - 1)
    xi = np.clip(x.astype(np.int32), 0, S - 1)
    yi = np.clip(y.astype(np.int32), 0, S - 1)

    zbuf = np.full(S * S, np.inf, np.float32)
    flat = yi * S + xi
    np.minimum.at(zbuf, flat, d)

    # keep only points that own their pixel (front-most)
    win = np.isclose(d, zbuf[flat], atol=1e-6)
    # Lambert from two lights, normals in the same flipped space
    nn = n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-9)
    L1 = np.array([0.4, 0.6, 0.7]); L1 /= np.linalg.norm(L1)
    L2 = np.array([-0.5, 0.2, 0.4]); L2 /= np.linalg.norm(L2)
    ns = np.stack([nn[:, axes[0]] * (-1 if flip[0] else 1),
                   nn[:, axes[1]] * (-1 if flip[1] else 1),
                   nn[:, axes[2]] * (-1 if flip[2] else 1)], 1)
    lam = 0.20 + 0.62 * np.clip(ns @ L1, 0, 1) + 0.28 * np.clip(ns @ L2, 0, 1)
    lam = np.clip(lam, 0, 1)

    img = np.zeros((S * S, 3), np.float32)
    val = np.stack([lam * 0.80, lam * 0.98, lam * 0.86], 1) * 255
    idx = flat[win]
    img[idx] = val[win]
    img = img.reshape(S, S, 3)
    # fill single-pixel holes with a 3x3 max so the surface reads solid
    pad = np.pad(img, ((1, 1), (1, 1), (0, 0)))
    mx = np.max(np.stack([pad[a:a + S, b:b + S] for a in range(3)
                          for b in range(3)]), 0)
    holes = img.sum(2) == 0
    img[holes] = mx[holes] * 0.92
    return img.astype(np.uint8)


views = [
    ("FRONT (+Z)",  (0, 1, 2), (False, False, False), None),
    ("BACK (-Z)",   (0, 1, 2), (True, False, True),   None),
    ("SIDE (+X)",   (2, 1, 0), (True, False, False),  None),
    ("HEAD close",  (0, 1, 2), (False, False, False), (0.16, 0.52)),
    ("LEGS close",  (0, 1, 2), (False, False, False), (-0.52, -0.05)),
    ("TOP (-Y)",    (0, 2, 1), (False, False, True),  None),
]
tiles = [render(P, N, ax, fl, t, cr) for t, ax, fl, cr in views]

cols, rows = 3, 2
sheet = np.zeros((rows * S, cols * S, 3), np.uint8)
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    sheet[r * S:(r + 1) * S, c * S:(c + 1) * S] = t
Image.fromarray(sheet).save("lion_geom_preview.png")
print("wrote lion_geom_preview.png  order:", [v[0] for v in views])
