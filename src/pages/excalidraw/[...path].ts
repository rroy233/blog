import type { APIContext, GetStaticPaths } from "astro";
import {
	excalidrawSceneFiles,
	getExcalidrawSceneAssetPaths,
} from "@/utils/excalidraw-scenes";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = () =>
	excalidrawSceneFiles.map(({ relativePath, source, hash }) => ({
		params: {
			path: getExcalidrawSceneAssetPaths(relativePath, hash)
				.rawScenePath.replace("/excalidraw/", "")
				.replace(/\/$/, ""),
		},
		props: { source },
	}));

export function GET({ props }: APIContext): Response {
	const { source } = props as { source: string };
	return new Response(source, {
		headers: {
			"Access-Control-Allow-Origin": "https://excalidraw.com",
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "application/vnd.excalidraw+json; charset=utf-8",
		},
	});
}
