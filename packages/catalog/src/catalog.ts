import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import * as digestBlocks from "./digestBlocks/catalog";

const actions = {};

/**
 * The production digest catalog.
 * Only LLM-authored content blocks are registered here.
 * Non-LLM sections (RelatedFromYourBookmarks, MyNote) use standalone schemas
 * and are embedded into the page separately.
 */
export default defineCatalog(schema, {
  components: digestBlocks,
  actions,
});
