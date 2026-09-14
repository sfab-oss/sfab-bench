/**
 * TESS v3 writer. The reader is `apps/web/src/cad/decodeTess.ts`; keep the two in step.
 *
 * Layout: magic, version, JSON header length, JSON header, then the raw arrays in
 * order — positions, normals, face ordinals, indices, side ordinals, edge polylines.
 * We emit no side ordinals and no edges: the format has fields for both, the
 * viewer skips them, so every file we write declares them as empty.
 */

const MAGIC = 1397966164; // "TESS"
const VERSION = 3;

export type FaceRange = { ord: number; indexStart: number; indexCount: number };

export type ComponentMesh = {
  positions: Float32Array;
  normals: Float32Array;
  faceOrds: Float32Array;
  indices: Uint32Array;
  faceRanges: FaceRange[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
};

function bytesOf(array: Float32Array | Uint32Array): Buffer {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

export function encodeTess(mesh: ComponentMesh): Buffer {
  const header = {
    positionCount: mesh.positions.length,
    normalCount: mesh.normals.length,
    faceOrdCount: mesh.faceOrds.length,
    indexCount: mesh.indices.length,
    sideOrdCount: 0,
    edges: [],
    faceRanges: mesh.faceRanges,
    bounds: mesh.bounds,
  };
  const json = Buffer.from(JSON.stringify(header), "utf8");
  const head = Buffer.alloc(12);
  head.writeUInt32LE(MAGIC, 0);
  head.writeUInt32LE(VERSION, 4);
  head.writeUInt32LE(json.length, 8);
  return Buffer.concat([
    head,
    json,
    bytesOf(mesh.positions),
    bytesOf(mesh.normals),
    bytesOf(mesh.faceOrds),
    bytesOf(mesh.indices),
  ]);
}
