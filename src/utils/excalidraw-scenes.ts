import {
	addExcalidrawContentHash,
	getExcalidrawContentHash,
	toExcalidrawPreviewPath,
} from "./excalidraw-hash";

const CONTENT_PREFIX = "/src/content/posts/";

const sceneModules = import.meta.glob("/src/content/posts/**/*.excalidraw", {
	eager: true,
	query: "?raw",
	import: "default",
}) as Record<string, string>;

export type ExcalidrawSceneFile = {
	relativePath: string;
	source: string;
	hash: string;
};

/** 所有文章目录内的 Excalidraw 源文件，供静态端点生成原文件和 SVG 预览。 */
export const excalidrawSceneFiles: ExcalidrawSceneFile[] = Object.entries(
	sceneModules,
)
	.map(([absolutePath, source]) => ({
		relativePath: absolutePath.slice(CONTENT_PREFIX.length),
		source,
		hash: getExcalidrawContentHash(source),
	}))
	.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

export function getExcalidrawSceneAssetPaths(
	relativePath: string,
	hash: string,
): { previewPath: string; rawScenePath: string } {
	return {
		previewPath: `/excalidraw-preview/${toExcalidrawPreviewPath(relativePath, hash)}`,
		rawScenePath: `/excalidraw/${addExcalidrawContentHash(relativePath, hash)}`,
	};
}
