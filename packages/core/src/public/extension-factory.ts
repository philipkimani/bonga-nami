import { ChatbotExtensionV1 } from "./extensions.js";

export interface ExtensionFactoryV1 {
  readonly name: string;
  readonly version: "v1";

  /**
   * Extension category (for documentation/organization only, not billing)
   */
  readonly category?: string;

  create(config: unknown): ChatbotExtensionV1;
}
