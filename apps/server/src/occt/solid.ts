import type { OpenCascade, Shape } from "./types";

/**
 * Volume, surface area, centre of mass and bounding box — computed once from the
 * exact B-rep, and once from the triangles we drew for it.
 *
 * The pair is the strongest oracle available for the tessellator, because it needs
 * no reference file and no second kernel. A closed solid's mesh must enclose the
 * same volume as its surfaces do, to within the chord tolerance, and the ways that
 * can fail are exactly the ways a part renders wrong:
 *
 * - a face dropped, or a seam left open, and the mesh volume falls short
 * - winding reversed, and the **signed** mesh volume comes back negative
 * - a transform applied twice or not at all, and the box moves
 * - a unit misread, and everything is out by 25.4 or 1000
 *
 * Nothing here is test-only: mass properties are what a "how heavy is this" answer
 * would be built on.
 */
export type SolidProps = {
  /** Signed. Negative means the surface normals point inward. */
  volume: number;
  area: number;
  centroid: [number, number, number];
  bbox: { min: [number, number, number]; max: [number, number, number] } | null;
};

/** Exact properties, from the B-rep surfaces themselves. */
export function solidProps(oc: OpenCascade, shape: Shape): SolidProps {
  const volumeProps = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(shape, volumeProps, true, false, false);
  const volume = volumeProps.Mass();
  const com = volumeProps.CentreOfMass();
  const centroid: [number, number, number] = [com.X(), com.Y(), com.Z()];
  com.delete();
  volumeProps.delete();

  const areaProps = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape, areaProps, false, false);
  const area = areaProps.Mass();
  areaProps.delete();

  const box = new oc.Bnd_Box_1();
  // `false`: measure the surfaces, not whatever triangulation happens to be cached
  // on the shape. Otherwise this stops being independent of the thing it checks.
  oc.BRepBndLib.Add(shape, box, false);
  let bbox: SolidProps["bbox"] = null;
  if (!box.IsVoid()) {
    const lo = box.CornerMin();
    const hi = box.CornerMax();
    bbox = { min: [lo.X(), lo.Y(), lo.Z()], max: [hi.X(), hi.Y(), hi.Z()] };
    lo.delete();
    hi.delete();
  }
  box.delete();

  return { volume, area, centroid, bbox };
}

/**
 * The same properties read back off the triangles, by the divergence theorem: each
 * triangle and the origin form a tetrahedron, and their signed volumes sum to the
 * volume enclosed — but only if the surface is closed and consistently wound.
 */
export function meshProps(mesh: {
  positions: Float32Array;
  indices: Uint32Array;
}): SolidProps {
  const { positions, indices } = mesh;
  let volume = 0;
  let area = 0;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3;
    const b = indices[i + 1]! * 3;
    const c = indices[i + 2]! * 3;
    const ax = positions[a]!,
      ay = positions[a + 1]!,
      az = positions[a + 2]!;
    const bx = positions[b]!,
      by = positions[b + 1]!,
      bz = positions[b + 2]!;
    const cxv = positions[c]!,
      cyv = positions[c + 1]!,
      czv = positions[c + 2]!;

    // a · (b × c) / 6 is the signed volume of the tetrahedron origin-a-b-c.
    const nx = by * czv - bz * cyv;
    const ny = bz * cxv - bx * czv;
    const nz = bx * cyv - by * cxv;
    const tetra = (ax * nx + ay * ny + az * nz) / 6;
    volume += tetra;
    // The tetrahedron's own centroid, weighted by its share of the total.
    cx += (tetra * (ax + bx + cxv)) / 4;
    cy += (tetra * (ay + by + cyv)) / 4;
    cz += (tetra * (az + bz + czv)) / 4;

    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = cxv - ax,
      vy = cyv - ay,
      vz = czv - az;
    const wx = uy * vz - uz * vy;
    const wy = uz * vx - ux * vz;
    const wz = ux * vy - uy * vx;
    area += Math.hypot(wx, wy, wz) / 2;
  }

  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis]!;
      if (value < min[axis]!) min[axis] = value;
      if (value > max[axis]!) max[axis] = value;
    }
  }

  const centroid: [number, number, number] =
    Math.abs(volume) > 1e-12
      ? [cx / volume, cy / volume, cz / volume]
      : [0, 0, 0];
  return {
    volume,
    area,
    centroid,
    bbox: Number.isFinite(min[0]) ? { min, max } : null,
  };
}
