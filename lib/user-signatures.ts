import {
  createItem,
  isConfigured as directusConfigured,
  listItems,
  updateItem,
} from "@/lib/directus-cms";
import { log } from "@/lib/logger";

const logger = log.child({ module: "user-signatures" });

export interface UserSignature {
  id: string;
  userEmail: string;
  signedName: string;
  pngDataUrl: string;
  updatedAt: string;
}

interface Row {
  id: string;
  user_email: string;
  signed_name: string;
  png_data_url: string;
  updated_at: string;
}

function mapRow(r: Row): UserSignature {
  return {
    id: r.id,
    userEmail: r.user_email,
    signedName: r.signed_name,
    pngDataUrl: r.png_data_url,
    updatedAt: r.updated_at,
  };
}

export async function getUserSignature(
  userEmail: string,
): Promise<UserSignature | null> {
  if (!(await directusConfigured())) return null;
  if (!userEmail) return null;
  try {
    const rows = await listItems<Row>("mp_user_signatures", {
      "filter[user_email][_eq]": userEmail.toLowerCase(),
      limit: 1,
    });
    return rows[0] ? mapRow(rows[0]) : null;
  } catch (err) {
    logger.warn("getUserSignature failed", { err: String(err) });
    return null;
  }
}

export async function upsertUserSignature(input: {
  userEmail: string;
  signedName: string;
  pngDataUrl: string;
}): Promise<UserSignature | null> {
  if (!(await directusConfigured())) return null;
  const email = input.userEmail.toLowerCase();
  try {
    const existing = await getUserSignature(email);
    if (existing) {
      const updated = await updateItem<Row>("mp_user_signatures", existing.id, {
        signed_name: input.signedName,
        png_data_url: input.pngDataUrl,
      });
      return mapRow(updated);
    }
    const created = await createItem<Row>("mp_user_signatures", {
      user_email: email,
      signed_name: input.signedName,
      png_data_url: input.pngDataUrl,
    });
    return mapRow(created);
  } catch (err) {
    logger.warn("upsertUserSignature failed", { err: String(err) });
    return null;
  }
}
