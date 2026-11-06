import type { APIContext, GetStaticPaths } from "astro";
import { renderExcalidrawSvg } from "@/utils/excalidraw-renderer";
import {
	excalidrawSceneFiles,
	getExcalidrawSceneAssetPaths,
} from "@/utils/excalidraw-scenes";

export const prerender = true;

export const getStaticPaths: GetStaticPaths = () =>
	excalidrawSceneFiles.map(({ relativePath, source, hash }) => ({
		params: {
			path: getExcalidrawSceneAssetPaths(relativePath, hash)
				.previewPath.replace("/excalidraw-preview/", "")
				.replace(/\.svg$/, ""),
		},
		props: { relativePath, source },
	}));

export async function GET({ props }: APIContext): Promise<Response> {
	const { relativePath, source } = props as {
		relativePath: string;
		source: string;
	};
	const svg = await renderExcalidrawSvg(source, relativePath);

	return new Response(svg, {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "image/svg+xml; charset=utf-8",
		},
	});
}
