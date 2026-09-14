import type { ComponentMesh, FaceRange } from "./tess";
import type { OpenCascade, Shape } from "./types";

/** Chord and angle tolerance. Chord is relative to the shape's own size. */
const LINEAR_DEFLECTION = 0.0015; // relative to each face's size
const ANGULAR_DEFLECTION = 0.35; // radians

/**
 * Tessellate one shape into a single interleaved mesh.
 *
 * Vertices are never shared between faces: each face contributes its own block of
 * positions. That is what makes `#o….f7` refs possible (every triangle belongs to
 * exactly one face ordinal) and it gives hard edges between faces for free, while
 * normals averaged inside a face keep curved surfaces smooth.
 */
export function tessellate(oc: OpenCascade, shape: Shape): ComponentMesh {
  new oc.BRepMesh_IncrementalMesh_2(shape, LINEAR_DEFLECTION, true, ANGULAR_DEFLECTION, false);

  const positions: number[] = [];
  const normals: number[] = [];
  const faceOrds: number[] = [];
  const indices: number[] = [];
  const faceRanges: FaceRange[] = [];
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let ord = 0;

  const explorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  for (; explorer.More(); explorer.Next()) {
    const face = oc.TopoDS.Face_1(explorer.Current());
    const location = new oc.TopLoc_Location_1();
    const handle = oc.BRep_Tool.Triangulation(face, location);
    if (handle.IsNull()) {
      location.delete();
      continue;
    }
    ord += 1;
    const triangulation = handle.get();
    const nodes = triangulation.Nodes();
    const triangles = triangulation.Triangles();
    const trsf = location.Transformation();
    const placed = !location.IsIdentity();
    const base = positions.length / 3;
    const nodeCount = nodes.Length();

    for (let i = 1; i <= nodeCount; i += 1) {
      const raw = nodes.Value(i);
      // `Transformed` returns a new gp_Pnt by value, so it is ours to free. On a
      // 150k-triangle assembly this one allocation is most of the leak.
      const point = placed ? raw.Transformed(trsf) : raw;
      const x = point.X();
      const y = point.Y();
      const z = point.Z();
      if (placed) point.delete();
      raw.delete();
      positions.push(x, y, z);
      faceOrds.push(ord);
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
    }

    const reversed =
      face.Orientation_1().value === oc.TopAbs_Orientation.TopAbs_REVERSED.value;
    const indexStart = indices.length;
    const accumulated = new Float64Array(nodeCount * 3);

    for (let i = 1; i <= triangles.Length(); i += 1) {
      const triangle = triangles.Value(i);
      const n1 = triangle.Value(1);
      const n2 = reversed ? triangle.Value(3) : triangle.Value(2);
      const n3 = reversed ? triangle.Value(2) : triangle.Value(3);
      const a = base + n1 - 1;
      const b = base + n2 - 1;
      const c = base + n3 - 1;
      indices.push(a, b, c);

      const ux = positions[b * 3]! - positions[a * 3]!;
      const uy = positions[b * 3 + 1]! - positions[a * 3 + 1]!;
      const uz = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
      const vx = positions[c * 3]! - positions[a * 3]!;
      const vy = positions[c * 3 + 1]! - positions[a * 3 + 1]!;
      const vz = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const node of [n1, n2, n3]) {
        accumulated[(node - 1) * 3] += nx;
        accumulated[(node - 1) * 3 + 1] += ny;
        accumulated[(node - 1) * 3 + 2] += nz;
      }
    }

    for (let i = 0; i < nodeCount; i += 1) {
      const nx = accumulated[i * 3]!;
      const ny = accumulated[i * 3 + 1]!;
      const nz = accumulated[i * 3 + 2]!;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / length, ny / length, nz / length);
    }

    faceRanges.push({ ord, indexStart, indexCount: indices.length - indexStart });
    location.delete();
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    faceOrds: new Float32Array(faceOrds),
    indices: new Uint32Array(indices),
    faceRanges,
    bounds: { min, max },
  };
}
