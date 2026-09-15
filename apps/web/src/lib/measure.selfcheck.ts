import { FIT_HOME_DIR, fitDirectionFor, frameFitObject, homeFitDirection } from "../cad/review";
import {
  MEASURE_DESKTOP_SPHERE_PX,
  MEASURE_DESKTOP_TEXT_PX,
  MEASURE_LABEL_OFFSET_Y,
  MEASURE_SPHERE_RADIUS,
  measureNativeLabelHeight,
  measureNativeTextHeight,
  measureScreenScale,
  perspectiveWorldPerCssPx,
} from "./measure";

function expect(cond: boolean, label: string) {
  if (!cond) throw new Error(label);
}

expect(FIT_HOME_DIR[0] === 0.6 && FIT_HOME_DIR[1] === 0.5 && FIT_HOME_DIR[2] === 0.7, "home is the load direction");
const home = homeFitDirection();
expect(home.x === 0.6 && home.y === 0.5 && home.z === 0.7, "home vector");
expect(fitDirectionFor("selection") === undefined, "frame selection omits dir");
const homeDir = fitDirectionFor("model");
expect(
  homeDir !== undefined && homeDir.x === 0.6 && homeDir.y === 0.5 && homeDir.z === 0.7,
  "home passes the load dir",
);

const root = { id: "root" };
const part = { object: { id: "part" } };
const review = { root, parts: [part] };
expect(frameFitObject(review, 0, "model") === root, "home with a selection still frames the model");

expect(MEASURE_DESKTOP_TEXT_PX >= 13 && MEASURE_DESKTOP_TEXT_PX <= 14, "text 13–14 CSS px");
expect(MEASURE_DESKTOP_SPHERE_PX >= 8 && MEASURE_DESKTOP_SPHERE_PX <= 10, "spheres 8–10 CSS px");

const perPx = perspectiveWorldPerCssPx(1, 90, 100);
expect(Math.abs(perPx - 0.02) < 1e-12, "90° fov, dist 1, height 100 → 0.02 m/px");
expect(perspectiveWorldPerCssPx(2, 90, 100) === perPx * 2, "linear in distance");
expect(perspectiveWorldPerCssPx(1, 90, 200) === perPx / 2, "inverse in canvas height");
expect(perspectiveWorldPerCssPx(1, 90, 100, 2) === perPx / 2, "inverse in zoom");
expect(perspectiveWorldPerCssPx(1, 60, 100) < perPx, "narrower fov is smaller metres/px");

const sphereScale = measureScreenScale(MEASURE_SPHERE_RADIUS * 2, MEASURE_DESKTOP_SPHERE_PX, 1, 90, 100);
expect(Math.abs(sphereScale - 22.5) < 1e-12, "9px sphere at 0.02 m/px");
expect(
  measureScreenScale(MEASURE_SPHERE_RADIUS * 2, MEASURE_DESKTOP_SPHERE_PX, 2, 90, 100) === sphereScale * 2,
  "constant screen size when distance doubles",
);

const textH = measureNativeTextHeight();
expect(Math.abs(textH - 0.0108) < 1e-12, "18px at pixelSize 0.0006");
const labelScale = measureScreenScale(textH, MEASURE_DESKTOP_TEXT_PX, 1, 90, 100);
expect(Math.abs(labelScale - 25) < 1e-12, "13.5px text at 0.02 m/px");

const halfLabel = measureNativeLabelHeight() / 2;
expect(MEASURE_LABEL_OFFSET_Y > halfLabel, "offset clears the line at any zoom");

console.log("measure.selfcheck ok");
