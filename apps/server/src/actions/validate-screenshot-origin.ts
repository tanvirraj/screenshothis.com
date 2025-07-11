import { eq } from "drizzle-orm";
import wildcardMatch from "wildcard-match";

import { db } from "#/db";
import * as schema from "#/db/schema";
import { logger } from "#/lib/logger";

/**
 * Checks whether the given URL's origin or hostname is allowed for the specified workspace.
 *
 * The workspace's `metadata` column may include a JSON object with an `allowedOrigins` array.
 * If the array is empty or undefined, no restriction is applied (all origins allowed).
 *
 * @returns `true` if the origin is allowed or unrestricted, otherwise `false`.
 */
export async function isScreenshotOriginAllowed(
	workspaceId: string,
	urlString: string,
): Promise<boolean> {
	const workspaceRecord = await db.query.workspace.findFirst({
		columns: {
			metadata: true,
		},
		where: eq(schema.workspace.id, workspaceId),
	});

	if (!workspaceRecord) {
		return false;
	}

	let allowedOrigins: string[] | undefined;
	try {
		if (workspaceRecord.metadata) {
			const parsed = JSON.parse(workspaceRecord.metadata as string);
			if (
				parsed?.allowedOrigins &&
				Array.isArray(parsed.allowedOrigins) &&
				parsed.allowedOrigins.every(
					(origin: unknown) => typeof origin === "string",
				)
			) {
				allowedOrigins = parsed.allowedOrigins;
			}
		}
	} catch (error) {
		logger.warn(
			{
				err: error,
				workspaceId,
			},
			"invalid JSON in workspace metadata",
		);
	}

	if (!allowedOrigins || allowedOrigins.length === 0) {
		return true; // no restrictions configured
	}

	try {
		const targetUrl = new URL(urlString);
		const match = wildcardMatch(allowedOrigins, { separator: false });
		return (
			match(targetUrl.origin) ||
			match(targetUrl.hostname) ||
			allowedOrigins.some((pattern) => pattern === "*" || pattern === "**")
		);
	} catch (error) {
		// Invalid URL format
		return false;
	}
}
