import json, struct, sys, collections

path = sys.argv[1] if len(sys.argv) > 1 else "lion3D.glb"

with open(path, "rb") as f:
    magic, version, length = struct.unpack("<4sII", f.read(12))
    assert magic == b"glTF", f"not a glb: {magic}"
    print(f"GLB version {version}, total {length/1024/1024:.2f} MB")
    chunks = []
    while f.tell() < length:
        clen, ctype = struct.unpack("<I4s", f.read(8))
        data = f.read(clen)
        chunks.append((ctype, data))
        print(f"  chunk {ctype.decode(errors='replace')}: {clen/1024/1024:.2f} MB")

j = json.loads(next(d for t, d in chunks if t == b"JSON"))

print("\nasset:", json.dumps(j.get("asset", {}), ensure_ascii=False))
print("extensionsUsed:", j.get("extensionsUsed"))
for k in ("scenes", "nodes", "meshes", "materials", "textures", "images",
          "animations", "skins", "cameras", "accessors", "bufferViews"):
    print(f"{k}: {len(j.get(k, []))}")

# --- animations ---
print("\n=== ANIMATIONS ===")
if not j.get("animations"):
    print("(none)")
for i, a in enumerate(j.get("animations", [])):
    paths = collections.Counter(c["target"]["path"] for c in a["channels"])
    targets = {c["target"].get("node") for c in a["channels"]}
    # duration from input accessor max
    dur = 0.0
    for s in a["samplers"]:
        acc = j["accessors"][s["input"]]
        if acc.get("max"):
            dur = max(dur, acc["max"][0])
    interps = collections.Counter(s.get("interpolation", "LINEAR") for s in a["samplers"])
    print(f"[{i}] name={a.get('name')!r} channels={len(a['channels'])} "
          f"nodes={len(targets)} duration={dur:.3f}s")
    print(f"     paths={dict(paths)} interp={dict(interps)}")

# --- skins ---
print("\n=== SKINS ===")
if not j.get("skins"):
    print("(none)")
for i, s in enumerate(j.get("skins", [])):
    print(f"[{i}] name={s.get('name')!r} joints={len(s.get('joints', []))} "
          f"skeleton={s.get('skeleton')}")

# --- scene graph ---
print("\n=== SCENE GRAPH ===")
nodes = j.get("nodes", [])
def walk(idx, depth, seen):
    if idx in seen or depth > 6:
        return
    seen.add(idx)
    n = nodes[idx]
    tags = []
    if "mesh" in n:
        m = j["meshes"][n["mesh"]]
        prims = len(m.get("primitives", []))
        verts = 0
        for p in m["primitives"]:
            pos = p["attributes"].get("POSITION")
            if pos is not None:
                verts += j["accessors"][pos]["count"]
        tags.append(f"mesh={m.get('name')!r} prims={prims} verts={verts}")
    if "skin" in n:
        tags.append(f"skin={n['skin']}")
    if "camera" in n:
        tags.append("camera")
    for k in ("translation", "rotation", "scale"):
        if k in n:
            tags.append(f"{k}={[round(v,3) for v in n[k]]}")
    kids = n.get("children", [])
    print("  " * depth + f"- [{idx}] {n.get('name')!r} " + " ".join(tags) +
          (f" (children={len(kids)})" if kids else ""))
    for c in kids:
        walk(c, depth + 1, seen)

seen = set()
for sc in j.get("scenes", []):
    print(f"scene {sc.get('name')!r}:")
    for r in sc.get("nodes", []):
        walk(r, 1, seen)

# --- materials ---
print("\n=== MATERIALS ===")
for i, m in enumerate(j.get("materials", [])):
    pbr = m.get("pbrMetallicRoughness", {})
    print(f"[{i}] {m.get('name')!r} baseColor={pbr.get('baseColorFactor')} "
          f"metal={pbr.get('metallicFactor')} rough={pbr.get('roughnessFactor')} "
          f"tex={'baseColorTexture' in pbr} exts={list(m.get('extensions', {}))} "
          f"alphaMode={m.get('alphaMode')}")

# --- images ---
print("\n=== IMAGES ===")
for i, im in enumerate(j.get("images", [])):
    bv = im.get("bufferView")
    size = j["bufferViews"][bv]["byteLength"] if bv is not None else None
    print(f"[{i}] {im.get('name')!r} mime={im.get('mimeType')} "
          f"uri={im.get('uri')} bytes={size and round(size/1024)} KB")

# --- totals ---
total_verts = 0
total_tris = 0
for m in j.get("meshes", []):
    for p in m["primitives"]:
        pos = p["attributes"].get("POSITION")
        if pos is not None:
            total_verts += j["accessors"][pos]["count"]
        if "indices" in p:
            total_tris += j["accessors"][p["indices"]]["count"] // 3
print(f"\nTOTAL verts={total_verts} tris={total_tris}")
