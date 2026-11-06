import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { visit } from "unist-util-visit";
import {
	getExcalidrawContentHash,
	toExcalidrawPreviewPath,
	addExcalidrawContentHash,
} from "../utils/excalidraw-hash.ts";

const POSTS_DIRECTORY = resolve(process.cwd(), "src/content/posts");
const EXCALIDRAW_EXTENSION = ".excalidraw";

function encodePath(path) {
	return path.split("/").map(encodeURIComponent).join("/");
}

function resolveScenePath(src, markdownPath) {
	if (!markdownPath || /^([a-z][a-z\d+.-]*:|\/)/i.test(src)) {
		return null;
	}

	const pathname = src.split(/[?#]/, 1)[0];
	if (!pathname.toLowerCase().endsWith(EXCALIDRAW_EXTENSION)) return null;

	const absoluteScenePath = resolve(
		dirname(markdownPath),
		decodeURIComponent(pathname),
	);
	const relativeScenePath = relative(POSTS_DIRECTORY, absoluteScenePath);
	if (
		relativeScenePath.startsWith(`..${sep}`) ||
		relativeScenePath === ".." ||
		!relativeScenePath.toLowerCase().endsWith(EXCALIDRAW_EXTENSION)
	) {
		throw new Error(
			`Excalidraw 文件必须位于 src/content/posts 内: ${src}（文章：${markdownPath}）`,
		);
	}
	if (!existsSync(absoluteScenePath)) {
		throw new Error(`未找到 Excalidraw 文件: ${src}（文章：${markdownPath}）`);
	}

	return relativeScenePath.split(sep).join("/");
}

/**
 * 将 Markdown 的 ![](... .excalidraw) 转换为 Fancybox 可预览的静态 SVG。
 * 原始 JSON 会由 /excalidraw/* 端点提供给 excalidraw.com 加载。
 */
export function rehypeExcalidraw() {
	return (tree, file) => {
		visit(tree, "element", (node, index, parent) => {
			if (
				node.tagName !== "img" ||
				typeof index !== "number" ||
				!parent ||
				typeof node.properties?.src !== "string"
			) {
				return;
			}

			const relativeScenePath = resolveScenePath(
				node.properties.src,
				file.path,
			);
			if (!relativeScenePath) return;

			const source = readFileSync(
				resolve(POSTS_DIRECTORY, relativeScenePath),
				"utf8",
			);
			const hash = getExcalidrawContentHash(source);
			const previewPath = `/excalidraw-preview/${encodePath(
				toExcalidrawPreviewPath(relativeScenePath, hash),
			)}`;
			// 站点配置使用 trailingSlash: "always"，静态端点的真实地址带尾部斜杠。
			const rawScenePath = `/excalidraw/${encodePath(
				addExcalidrawContentHash(relativeScenePath, hash),
			)}/`;
			// 保持 Markdown 图片的原始节点与属性，让后续 figure 插件、文章样式和
			// 通用图片浏览器沿用同一条路径。该标记只供 Fancybox 工具栏读取场景地址。
			node.properties.src = previewPath;
			node.properties["data-excalidraw-scene"] = rawScenePath;
		});
	};
}
