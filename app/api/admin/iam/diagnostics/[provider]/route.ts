export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/auth";
import {
  ApiError,
  createSuccessResponse,
  handleApiError,
} from "@/lib/api-utils";
import { requireAdminPanel } from "@/lib/admin-auth";
import { getProvider } from "@/lib/permissions/registry";

/**
 * GET /api/admin/iam/diagnostics/[provider]
 *
 * Uruchamia live probe natywnego providera — ipv.configured flag, listRoles
 * próba, opcjonalnie findUser dla podanego email. Używane w IamToolsPanel
 * jako „Testuj provider" żeby admin mógł zweryfikować konfigurację bez
 * loginowania się do aplikacji źródłowej.
 *
 * Query:
 *   ?email=<email>   — opcjonalne, wywołuje getUserRole żeby pokazać jaką
 *                       rolę provider widzi dla tego usera.
 */
interface Ctx {
  params: Promise<{ provider: string }>;
}

export async function GET(req: Request, { params }: Ctx) {
  try {
    const session = await getServerSession(authOptions);
    requireAdminPanel(session);

    const { provider: providerId } = await params;
    const provider = getProvider(providerId);
    if (!provider) {
      throw ApiError.notFound(`Unknown provider: ${providerId}`);
    }

    const url = new URL(req.url);
    const email = url.searchParams.get("email")?.trim() || null;

    const out: {
      providerId: string;
      label: string;
      configured: boolean;
      supportsCustomRoles: boolean;
      roles: Array<{
        id: string;
        name: string;
        userCount: number | null;
      }> | null;
      rolesError?: string;
      userLookup?: {
        email: string;
        found: boolean;
        currentRole: string | null;
        error?: string;
      };
    } = {
      providerId: provider.id,
      label: provider.label,
      configured: provider.isConfigured(),
      supportsCustomRoles: provider.supportsCustomRoles(),
      roles: null,
    };

    if (out.configured) {
      try {
        const roles = await provider.listRoles();
        out.roles = roles.map((r) => ({
          id: r.id,
          name: r.name,
          userCount: r.userCount ?? null,
        }));
      } catch (err) {
        out.rolesError = err instanceof Error ? err.message : String(err);
      }

      if (email) {
        try {
          const currentRole = await provider.getUserRole(email);
          out.userLookup = {
            email,
            found: currentRole !== null,
            currentRole,
          };
        } catch (err) {
          out.userLookup = {
            email,
            found: false,
            currentRole: null,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }

    return createSuccessResponse(out);
  } catch (err) {
    return handleApiError(err);
  }
}
