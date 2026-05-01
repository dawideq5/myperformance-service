export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import { requireAdminPanel } from "@/lib/admin-auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import {
  addGroupResource,
  listGroupResources,
  removeGroupResource,
  type GroupResourceKind,
} from "@/lib/permissions/group-resources";

interface Ctx {
  params: Promise<{ id: string }>;
}

const VALID_KINDS: GroupResourceKind[] = [
  "documenso_org",
  "moodle_course",
  "chatwoot_inbox",
];

/**
 * GET /api/admin/groups/[id]/resources
 *   → lista zasobów (Documenso org / Moodle course / Chatwoot inbox)
 *     które user automatycznie dostanie po dołączeniu do tej grupy.
 */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const resources = await listGroupResources(id);
    return createSuccessResponse({ resources });
  } catch (err) {
    return handleApiError(err);
  }
}

interface PostPayload {
  kind?: string;
  resourceId?: string;
  roleHint?: string | null;
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as PostPayload | null;
    const kind = body?.kind;
    const resourceId = body?.resourceId;
    if (!kind || !VALID_KINDS.includes(kind as GroupResourceKind)) {
      throw ApiError.badRequest(
        `kind musi być jednym z: ${VALID_KINDS.join(", ")}`,
      );
    }
    if (!resourceId || !resourceId.trim()) {
      throw ApiError.badRequest("resourceId wymagany");
    }
    const mapping = await addGroupResource({
      groupId: id,
      kind: kind as GroupResourceKind,
      resourceId: resourceId.trim(),
      roleHint: body?.roleHint ?? null,
      actor: session?.user?.email ?? "unknown",
    });
    return createSuccessResponse({ mapping });
  } catch (err) {
    return handleApiError(err);
  }
}

interface DeletePayload {
  mappingId?: string;
}

export async function DELETE(req: Request, { params: _params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);
    const url = new URL(req.url);
    const mappingId =
      url.searchParams.get("mappingId") ||
      ((await req.json().catch(() => null)) as DeletePayload | null)?.mappingId;
    if (!mappingId) throw ApiError.badRequest("mappingId wymagany");
    await removeGroupResource(mappingId);
    return createSuccessResponse({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
