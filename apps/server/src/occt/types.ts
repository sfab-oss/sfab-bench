/**
 * Hand-written surface for the parts of opencascade.js we call. The package ships
 * no types for this build, and the full OCCT API is far larger than the loader needs.
 *
 * Two quirks of this build leak into these types:
 *  - `char*` / `char16_t*` are not bound, so strings come out of `$$.ptr` by hand
 *    (see `readAscii` / `readExtended` in document.ts).
 *  - Overloads are suffixed (`_1`, `_2`, …) in the order OCCT declares them.
 */

/** An embind object handle. `ptr` is the address of the C++ object in the wasm heap. */
export type Embound = { $$: { ptr: number } };

/**
 * embind hands back a JS handle for every call that returns an object, and this
 * build has no FinalizationRegistry, so nothing is reclaimed unless we say so.
 * Anything we own must be `delete()`d or the wasm heap grows until it hits its
 * hard 2 GB ceiling and the kernel starts failing every call.
 */
export interface Deletable {
  delete(): void;
}

export type Enum = { value: number };

export interface Trsf {
  Value(row: number, col: number): number;
}

export interface Location extends Deletable {
  IsIdentity(): boolean;
  Transformation(): Trsf;
}

export interface Pnt extends Deletable {
  X(): number;
  Y(): number;
  Z(): number;
  /** Returns a new gp_Pnt by value — the caller owns it. */
  Transformed(trsf: Trsf): Pnt;
}

export interface GProps extends Deletable {
  /** Volume for `VolumeProperties`, area for `SurfaceProperties`. */
  Mass(): number;
  CentreOfMass(): Pnt;
}

export interface Box extends Deletable {
  IsVoid(): boolean;
  CornerMin(): Pnt;
  CornerMax(): Pnt;
}

export interface Shape extends Deletable {
  IsNull(): boolean;
  Orientation_1(): Enum;
}

export interface Label extends Embound, Deletable {
  Tag(): number;
  NbChildren(): number;
  FindAttribute_1(id: unknown, attr: Embound): boolean;
}

export interface Triangle {
  Value(i: number): number;
}

export interface Array1<T> extends Deletable {
  Length(): number;
  Value(i: number): T;
}

export interface Triangulation extends Deletable {
  NbNodes(): number;
  NbTriangles(): number;
  Nodes(): Array1<Pnt>;
  Triangles(): Array1<Triangle>;
}

export interface Handle<T> extends Deletable {
  IsNull(): boolean;
  get(): T;
}

export interface ShapeToolStatics {
  IsFree(label: Label): boolean;
  IsAssembly(label: Label): boolean;
  IsComponent(label: Label): boolean;
  IsSimpleShape(label: Label): boolean;
  GetReferredShape(label: Label, out: Label): boolean;
  GetLocation(label: Label): Location;
  GetShape_2(label: Label): Shape;
}

export interface ShapeTool {
  BaseLabel(): Label;
}

export interface ColorTool {
  GetColor_1(label: Label, type: Enum, out: Color): boolean;
  GetColor_4(label: Label, type: Enum, out: Color): boolean;
}

export interface Color extends Deletable {
  Red(): number;
  Green(): number;
  Blue(): number;
}

export interface StepReader extends Deletable {
  SetColorMode(on: boolean): void;
  SetNameMode(on: boolean): void;
  ReadFile(path: string): Enum;
  Transfer_1(doc: unknown): boolean;
}

export interface ChildIterator extends Deletable {
  More(): boolean;
  Next(): void;
  Value(): Label;
}

export interface Explorer extends Deletable {
  More(): boolean;
  Next(): void;
  Current(): Shape;
}

type Ctor<T, A extends unknown[] = unknown[]> = new (...args: A) => T;

export interface OpenCascade {
  FS: {
    writeFile(path: string, data: Uint8Array): void;
    unlink(path: string): void;
  };
  /** Whole wasm heap. Its length is what the recycle watermark watches. */
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
  HEAPU32: Uint32Array;
  UTF8ToString(ptr: number): string;

  TCollection_AsciiString_1: Ctor<Embound & Deletable>;
  TCollection_ExtendedString_1: Ctor<Embound & Deletable>;
  TDocStd_Document: Ctor<{ Main(): Label } & Deletable>;
  Handle_TDocStd_Document_2: Ctor<Deletable>;
  STEPCAFControl_Reader_1: Ctor<StepReader & Deletable>;
  IFSelect_ReturnStatus: { IFSelect_RetDone: Enum };

  XCAFDoc_DocumentTool: {
    ShapeTool(label: Label): Handle<ShapeTool>;
    ColorTool(label: Label): Handle<ColorTool>;
  };
  XCAFDoc_ShapeTool: ShapeToolStatics;
  XCAFDoc_ColorType: { XCAFDoc_ColorSurf: Enum; XCAFDoc_ColorGen: Enum };

  TDF_ChildIterator_2: Ctor<ChildIterator>;
  TDF_Label: Ctor<Label>;
  TDF_Tool: { Entry(label: Label, out: Embound): void };
  TDataStd_Name: { GetID(): unknown };
  Handle_TDF_Attribute_1: Ctor<Handle<Embound> & Embound>;
  Handle_TDataStd_Name_2: Ctor<Handle<{ Get(): Embound }>>;

  Quantity_Color_1: Ctor<Color & Deletable>;

  BRepMesh_IncrementalMesh_2: Ctor<Deletable>;
  GProp_GProps_1: Ctor<GProps & Deletable>;
  BRepGProp: {
    /** `(shape, out, onlyClosed, useSpan, cgFlag)` — this build takes exactly five. */
    VolumeProperties_1(
      shape: Shape,
      out: GProps,
      onlyClosed: boolean,
      useSpan: boolean,
      cgFlag: boolean
    ): void;
    SurfaceProperties_1(
      shape: Shape,
      out: GProps,
      useSpan: boolean,
      cgFlag: boolean
    ): void;
  };
  Bnd_Box_1: Ctor<Box & Deletable>;
  BRepBndLib: { Add(shape: Shape, box: Box, useTriangulation: boolean): void };
  TopExp_Explorer_2: Ctor<Explorer>;
  TopAbs_ShapeEnum: {
    TopAbs_FACE: Enum;
    TopAbs_SHELL: Enum;
    TopAbs_SHAPE: Enum;
  };
  TopAbs_Orientation: { TopAbs_REVERSED: Enum };
  TopoDS: { Face_1(shape: Shape): Shape };
  TopLoc_Location_1: Ctor<Location>;
  BRep_Tool: {
    Triangulation(face: Shape, loc: Location): Handle<Triangulation>;
    /** False for a free-standing surface, which has no volume to measure. */
    IsClosed_1(shape: Shape): boolean;
  };
}
