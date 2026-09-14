import type { UIMessage } from "ai";

import type { AIDataPart, AIMetadata } from "./ai-types";

export type GalleryChatMessage = UIMessage<AIMetadata, AIDataPart>;
