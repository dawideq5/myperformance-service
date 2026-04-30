"use client";

import { Clock, Globe } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  isKadromierz,
  isMoodle,
  isSyncedToGoogle,
} from "@/lib/services/calendar-service";
import type { CalendarEvent } from "@/app/account/types";

/**
 * Surfaces where a calendar event lives. Reads `source` and `googleEventId`
 * to mark Google sync as soon as the create response carries the link, so the
 * badge lights up without a manual refresh.
 */
export function CalendarFanoutBadge({ event }: { event: CalendarEvent }) {
  const isGoogle = isSyncedToGoogle(event);
  const isKadro = isKadromierz(event);
  const isMood = isMoodle(event);

  if (isKadro) {
    return (
      <Badge tone="warning">
        <Clock className="w-2.5 h-2.5 mr-1" aria-hidden="true" />
        Kadromierz
      </Badge>
    );
  }
  if (isMood) {
    return <Badge tone="warning">Akademia</Badge>;
  }
  if (isGoogle) {
    return (
      <Badge tone="info">
        <Globe className="w-2.5 h-2.5 mr-1" aria-hidden="true" />
        Google
      </Badge>
    );
  }
  return null;
}
