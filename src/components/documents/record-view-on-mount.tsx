"use client";

import * as React from "react";
import { recordView } from "@/app/actions/favorites";

/**
 * Fires recordView() once per mount. Deliberately a client component
 * (not done in the Server Component page itself) so it only triggers
 * on an actual browser render of the page, not on server-side
 * prerendering/prefetching that Next.js might do for a link the user
 * hasn't actually clicked yet. Renders nothing.
 */
export function RecordViewOnMount({ documentId }: { documentId: string }) {
  React.useEffect(() => {
    recordView(documentId).catch(() => {
      // Best-effort — a failed view-tracking call should never surface
      // as a user-visible error on a page that otherwise loaded fine.
    });
  }, [documentId]);

  return null;
}
