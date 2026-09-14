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

export type Enum = { value: number };

export interface Trsf {
  Value(row: number, col: number): number;
}

export interface Location {
  IsIdentity(): boolean;
  Transformation(): Trsf;
  delete(): void;
}

export interface Pnt {
  X(): number;
  Y(): number;
  Z(): number;
  Transformed(trsf: Trsf): Pnt;
}

export interface Shape {
  IsNull(): boolean;
  Orientation_1(): Enum;
}

export interface Label extends Embound {
  Tag(): number;
  NbChildren(): number;
  FindAttribute_1(id: unknown, attr: Embound): boolean;
}

export interface Triangle {
  Value(i: number): number;
}

export interface Array1<T> {
  Length(): number;
  Value(i: number): T;
}

export interface Triangulation {
  NbNodes(): number;
  NbTriangles(): number;
  Nodes(): Array1<Pnt>;
  Triangles(): Array1<Triangle>;
}

export interface Handle<T> {
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

export interface Color {
  Red(): number;
  Green(): number;
  Blue(): number;
}

export interface StepReader {
  SetColorMode(on: boolean): void;
  SetNameMode(on: boolean): void;
  ReadFile(path: string): Enum;
  Transfer_1(doc: unknown): boolean;
}

export interface ChildIterator {
  More(): boolean;
  Next(): void;
  Value(): Label;
}

export interface Explorer {
  More(): boolean;
  Next(): void;
  Current(): Shape;
}

type Ctor<T, A extends unknown[] = unknown[]> = new (...args: A) => T;

export interface OpenCascade {
  FS: { writeFile(path: string, data: Uint8Array): void; unlink(path: string): void };
  HEAPU16: Uint16Array;
  HEAPU32: Uint32Array;
  UTF8ToString(ptr: number): string;

  TCollection_AsciiString_1: Ctor<Embound>;
  TCollection_ExtendedString_1: Ctor<Embound>;
  TDocStd_Document: Ctor<{ Main(): Label }>;
  Handle_TDocStd_Document_2: Ctor<unknown>;
  STEPCAFControl_Reader_1: Ctor<StepReader>;
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

  Quantity_Color_1: Ctor<Color>;

  BRepMesh_IncrementalMesh_2: Ctor<unknown>;
  TopExp_Explorer_2: Ctor<Explorer>;
  TopAbs_ShapeEnum: { TopAbs_FACE: Enum; TopAbs_SHAPE: Enum };
  TopAbs_Orientation: { TopAbs_REVERSED: Enum };
  TopoDS: { Face_1(shape: Shape): Shape };
  TopLoc_Location_1: Ctor<Location>;
  BRep_Tool: { Triangulation(face: Shape, loc: Location): Handle<Triangulation> };
}
