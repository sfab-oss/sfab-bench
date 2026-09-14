/** A component's tessellation (.tess, TESS v3). Coordinates are CAD millimetres, Z-up. */

export type FaceRange = {
  ord: number;
  indexStart: number;
  indexCount: number;
};

export type ComponentMesh = {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  faceOrds: Float32Array;
  faceRanges: FaceRange[];
};

const MAGIC = 1397966164; // TESS
const VERSION = 3;

export function decodeTess(bytes: Uint8Array): ComponentMesh {
  if (bytes.length < 12) throw new Error("tess file too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC || view.getUint32(4, true) !== VERSION) {
    throw new Error("not a TESS v3 file");
  }
  const jsonLen = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jsonLen))) as {
    positionCount: number;
    normalCount: number;
    faceOrdCount: number;
    indexCount: number;
    sideOrdCount: number;
    edges: { count: number }[];
    faceRanges: FaceRange[];
  };
  let offset = 12 + jsonLen;
  // Little-endian everywhere we run (browsers + Node on all our target platforms), so
  // we can view a fresh, private copy of the raw bytes directly as typed arrays instead
  // of copying through DataView element-by-element. `bytes.slice(start, end)` returns a
  // new Uint8Array backed by its own ArrayBuffer starting at byte 0, so it is always
  // 4-byte aligned regardless of the original offset.
  const takeF32 = (count: number) => {
    const byteLen = count * 4;
    const out = new Float32Array(bytes.slice(offset, offset + byteLen).buffer);
    offset += byteLen;
    return out;
  };
  const takeU32 = (count: number) => {
    const byteLen = count * 4;
    const out = new Uint32Array(bytes.slice(offset, offset + byteLen).buffer);
    offset += byteLen;
    return out;
  };
  const positions = takeF32(header.positionCount);
  const normals = takeF32(header.normalCount);
  const faceOrds = takeF32(header.faceOrdCount);
  const indices = takeU32(header.indexCount);
  takeU32(header.sideOrdCount);
  for (const edge of header.edges ?? []) takeF32(edge.count);
  return {
    positions,
    normals,
    indices,
    faceOrds,
    faceRanges: header.faceRanges ?? [],
  };
}
