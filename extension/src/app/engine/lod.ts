// Zoom semântico z0↔z1 com histerese (docs/twoddd.md): a banda morta entre
// Z0_ENTRA e Z0_SAI impede flicker quando o usuário paira sobre o limiar.
import { Z0_ENTRA, Z0_SAI } from "../tipos";

export type NivelLod = "z0" | "z1";

export function nivelPara(s: number, anterior: NivelLod | null): NivelLod {
  if (anterior === "z0") return s >= Z0_SAI ? "z1" : "z0";
  if (anterior === "z1") return s <= Z0_ENTRA ? "z0" : "z1";
  // Sem histórico, a banda morta resolve para cartões (o nível mais rico).
  return s <= Z0_ENTRA ? "z0" : "z1";
}
