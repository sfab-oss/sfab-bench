import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { APP_HOME } from "./config";

mkdirSync(APP_HOME, { recursive: true });

export const db = new DatabaseSync(join(APP_HOME, "state.sqlite"));
