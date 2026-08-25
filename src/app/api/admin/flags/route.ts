import { z } from "zod";
import { parseBody, ok, fail } from "@/lib/api";
import { listSectionFlags, setSectionDisabled, SWITCHABLE_SECTIONS } from "@/core/ops/section-flags";

export const runtime = "nodejs";

/** Рубильники разделов. Доступ уже ограничен middleware (/api/admin — только admin). */
export async function GET() {
  try {
    return ok({ flags: await listSectionFlags() });
  } catch (err) {
    return fail(err);
  }
}

const schema = z.object({
  action: z.enum(
    SWITCHABLE_SECTIONS.map((s) => s.action) as [string, ...string[]],
  ),
  disabled: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const body = await parseBody(req, schema);
    await setSectionDisabled(body.action, body.disabled);
    return ok({ flags: await listSectionFlags() });
  } catch (err) {
    return fail(err);
  }
}
