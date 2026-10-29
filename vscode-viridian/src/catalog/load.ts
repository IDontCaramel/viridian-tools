// the bundled catalog, built from the json files in catalog/

import { Catalog } from "./catalog.ts";
import type { CatalogOverrides, DataType, DocumentsCatalog, GeneratedCatalog } from "./types.ts";
import generated from "../../catalog/generated.json" with { type: "json" };
import dataTypes from "../../catalog/data-types.json" with { type: "json" };
import documents from "../../catalog/documents.json" with { type: "json" };
import overrides from "../../catalog/overrides.json" with { type: "json" };

let catalog: Catalog | undefined;

export function loadCatalog(): Catalog {
  catalog ??= new Catalog(
    generated as unknown as GeneratedCatalog,
    dataTypes as unknown as Record<string, DataType>,
    documents as unknown as DocumentsCatalog,
    overrides as unknown as CatalogOverrides,
  );
  return catalog;
}
