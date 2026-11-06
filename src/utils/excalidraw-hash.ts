import { createHash } from "node:crypto";

const HASH_LENGTH = 12;

/**
 * 为 Excalidraw 场景生成稳定的内容指纹。
 *
 * 指纹会出现在预览和原始场景的 URL 中；场景变化后浏览器与 CDN 会请求新的资源，
 * 因此可以安全使用 immutable 缓存。
 */
export function getExcalidrawContentHash(source: string): string {
	return createHash("sha256")
		.update(source)
		.digest("hex")
		.slice(0, HASH_LENGTH);
}

export function addExcalidrawContentHash(path: string, hash: string): string {
	const extensionIndex = path.toLowerCase().lastIndexOf(".excalidraw");
	if (extensionIndex === -1) {
		throw new Error(`无效的 Excalidraw 文件路径: ${path}`);
	}

	return `${path.slice(0, extensionIndex)}.${hash}${path.slice(extensionIndex)}`;
}

export function toExcalidrawPreviewPath(path: string, hash: string): string {
	const extensionIndex = path.toLowerCase().lastIndexOf(".excalidraw");
	if (extensionIndex === -1) {
		throw new Error(`无效的 Excalidraw 文件路径: ${path}`);
	}

	return `${path.slice(0, extensionIndex)}.${hash}.svg`;
}
