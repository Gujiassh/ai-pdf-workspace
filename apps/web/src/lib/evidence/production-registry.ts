import { ImageEvidenceRenderer } from "@/components/image-viewer";
import { PdfEvidenceRenderer } from "@/components/pdf-viewer";
import { createEvidenceModuleRegistry } from "./registry";

export const productionEvidenceRegistry = createEvidenceModuleRegistry([
  {
    assetKind: "pdf",
    locatorKinds: ["pdf_page", "pdf_region"],
    label: "PDF",
    uploadAccept: ["application/pdf"],
    EvidenceRenderer: PdfEvidenceRenderer,
  },
  {
    assetKind: "image",
    locatorKinds: ["image_region"],
    label: "Image",
    uploadAccept: [],
    EvidenceRenderer: ImageEvidenceRenderer,
  },
]);
