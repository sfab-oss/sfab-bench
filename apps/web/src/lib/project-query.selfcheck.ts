import { applyProjectSearch } from "./project-query";

function expect(cond: unknown, label: string) {
  if (!cond) throw new Error(label);
}

const switched = applyProjectSearch(
  "?project=/tmp/a&file=part.step&device=firmware.esp32c3.bin&source=main/main.c",
  "/tmp/b"
);
expect(switched.changed, "folder change is a change");
expect(switched.clearedDevice, "folder change drops the device");
expect(!switched.search.includes("device="), "device param is gone");
expect(!switched.search.includes("source="), "folder change drops the source");
expect(!switched.search.includes("file="), "file param is gone");
expect(switched.search.includes("project=%2Ftmp%2Fb"), "new folder is set");

const kept = applyProjectSearch(
  "?project=/tmp/a&file=part.step&device=firmware.esp32c3.bin",
  "/tmp/a"
);
expect(!kept.changed, "same folder is not a change");
expect(kept.search.includes("device="), "same folder keeps the device");
expect(kept.search.includes("file="), "same folder keeps the file");

const deep = applyProjectSearch(
  "?file=part.step&device=firmware.esp32c3.bin",
  "/tmp/a",
  { clearFile: false }
);
expect(deep.changed, "filling the folder is a change");
expect(!deep.clearedDevice, "deep link keeps the device");
expect(deep.search.includes("device="), "deep link still names the image");
expect(deep.search.includes("file="), "deep link still names the STEP");

console.log("project-query.selfcheck ok");
