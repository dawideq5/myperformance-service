import { withEmailClient } from "./client";

export interface EmailLayout {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  html: string;
  isDefault: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

const DEFAULT_LAYOUT_HTML = `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{subject}}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: #f4f4f5;
            color: #333333;
            -webkit-font-smoothing: antialiased;
        }
        table { border-spacing: 0; border-collapse: collapse; }
        .email-wrapper { width: 100%; background-color: #f4f4f5; padding: 40px 20px; }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .header {
            background-color: #0c0c0e;
            padding: 35px 20px;
            text-align: center;
        }
        .logo {
            color: #ffffff;
            font-size: 32px;
            font-weight: 800;
            letter-spacing: -0.5px;
            margin: 0;
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
        }
        .content {
            padding: 40px 30px;
            line-height: 1.6;
            font-size: 16px;
        }
        .content h1 {
            font-size: 24px;
            color: #111111;
            margin-top: 0;
            margin-bottom: 20px;
        }
        .content p { margin-top: 0; margin-bottom: 20px; color: #444444; }
        .content a { color: #0c0c0e; }
        .content strong { color: #111111; }
        .content ul { margin-top: 0; margin-bottom: 20px; padding-left: 20px; color: #444444; }
        .content li { margin: 4px 0; }
        .button-container { text-align: center; margin: 35px 0 15px 0; }
        .button {
            display: inline-block;
            padding: 14px 28px;
            background-color: #0c0c0e;
            color: #ffffff !important;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
            font-size: 16px;
        }
        .footer {
            background-color: #fafafa;
            padding: 30px 40px;
            text-align: center;
            font-size: 14px;
            color: #666666;
            border-top: 1px solid #eeeeee;
            line-height: 1.5;
        }
        .footer a {
            color: #0c0c0e;
            text-decoration: none;
            font-weight: bold;
        }
        .footer a:hover { text-decoration: underline; }
        @media screen and (max-width: 600px) {
            .email-wrapper { padding: 20px 10px; }
            .content { padding: 30px 20px; }
            .footer { padding: 25px 20px; }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <table class="email-container" width="100%" align="center" role="presentation">
            <tr>
                <td class="header">
                    <p class="logo">{{brand.name}}</p>
                </td>
            </tr>
            <tr>
                <td class="content">
                    {{content}}
                </td>
            </tr>
            <tr>
                <td class="footer">
                    <p style="margin: 0 0 5px 0;">Chcesz się z nami skontaktować?</p>
                    <p style="margin: 0;">Napisz na adres: <a href="mailto:{{brand.supportEmail}}">{{brand.supportEmail}}</a></p>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`;

const ZLECENIESERWISOWE_LAYOUT_HTML = `<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
<tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <!-- Header -->
    <tr><td style="background:#1a1a2e;padding:24px 40px;text-align:center">
      <img src="{{brand.logoUrl}}" alt="{{brand.name}}" height="40" style="max-height:40px">
    </td></tr>
    <!-- Content -->
    <tr><td style="padding:40px">
      {{content}}
    </td></tr>
    <!-- Footer -->
    <tr><td style="background:#f8f8f8;padding:24px 40px;text-align:center;font-size:12px;color:#999">
      <p style="margin:0 0 8px">{{brand.name}} · UNIKOM S.C., ul. Towarowa 2c, 43-100 Tychy</p>
      <p style="margin:0">Śledź status zlecenia: <a href="{{brand.url}}" style="color:#6366f1">{{brand.url}}</a></p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

export async function ensureDefaultLayout(): Promise<void> {
  await withEmailClient(async (c) => {
    await c.query(
      `INSERT INTO mp_email_layouts (slug, name, description, html, is_default)
       VALUES ('default', 'MyPerformance domyślny', 'Standardowy szkielet z czarnym headerem MyPerformance, białym tłem treści i szarą stopką. Slot {{content}} dla treści.', $1, TRUE)
       ON CONFLICT (slug) DO NOTHING`,
      [DEFAULT_LAYOUT_HTML],
    );
    await c.query(
      `INSERT INTO mp_email_layouts (slug, name, description, html, is_default)
       VALUES ('zlecenieserwisowe', 'Zlecenieserwisowe.pl — Serwis Telefonów', 'Layout dla wiadomości z serwisu telefonów (zlecenieserwisowe.pl). Ciemny header z logo, biała treść, stopka z adresem UNIKOM S.C. i linkiem do śledzenia zlecenia.', $1, FALSE)
       ON CONFLICT (slug) DO NOTHING`,
      [ZLECENIESERWISOWE_LAYOUT_HTML],
    );
  });
}

export async function listLayouts(): Promise<EmailLayout[]> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, html, is_default, updated_at, updated_by
         FROM mp_email_layouts ORDER BY is_default DESC, name`,
    );
    return res.rows.map(rowToLayout);
  });
}

export async function getDefaultLayout(): Promise<EmailLayout | null> {
  await ensureDefaultLayout();
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, html, is_default, updated_at, updated_by
         FROM mp_email_layouts WHERE is_default = TRUE LIMIT 1`,
    );
    return res.rows[0] ? rowToLayout(res.rows[0]) : null;
  });
}

export async function getLayout(id: string): Promise<EmailLayout | null> {
  return withEmailClient(async (c) => {
    const res = await c.query(
      `SELECT id, slug, name, description, html, is_default, updated_at, updated_by
         FROM mp_email_layouts WHERE id = $1`,
      [id],
    );
    return res.rows[0] ? rowToLayout(res.rows[0]) : null;
  });
}

export async function upsertLayout(args: {
  slug: string;
  name: string;
  description?: string | null;
  html: string;
  isDefault?: boolean;
  actor: string;
}): Promise<EmailLayout> {
  return withEmailClient(async (c) => {
    if (args.isDefault) {
      await c.query(`UPDATE mp_email_layouts SET is_default = FALSE`);
    }
    const res = await c.query(
      `INSERT INTO mp_email_layouts (slug, name, description, html, is_default, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         html = EXCLUDED.html,
         is_default = EXCLUDED.is_default,
         updated_at = now(),
         updated_by = EXCLUDED.updated_by
       RETURNING id, slug, name, description, html, is_default, updated_at, updated_by`,
      [
        args.slug,
        args.name,
        args.description ?? null,
        args.html,
        !!args.isDefault,
        args.actor,
      ],
    );
    return rowToLayout(res.rows[0]);
  });
}

interface LayoutRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  html: string;
  is_default: boolean;
  updated_at: Date;
  updated_by: string | null;
}

function rowToLayout(r: LayoutRow): EmailLayout {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    html: r.html,
    isDefault: r.is_default,
    updatedAt: r.updated_at.toISOString(),
    updatedBy: r.updated_by,
  };
}
